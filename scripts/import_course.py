"""Import the downloaded course folders into the study app's JSON content.

Reads every "NN - Section" folder in COURSE_DIR (set in the repo-root .env) and writes:
  app/content/sections/NN.json     section + lecture index (titles EN/VI)
  app/content/subtitles/<en|vi>/NN.json  subtitle cues per lecture
  app/content/quizzes/*.json       quiz + practice exam questions (EN/VI)
  app/content/notes/*.json         instructor notes from the .html lectures

Hand-edited files (sections, quizzes, notes) are never overwritten unless
--force is passed, so translations added later survive a re-import.
Transcripts are pure derived data and are always rewritten.

Usage:  python scripts/import_course.py [--force]
        python scripts/import_course.py --exam "more ex/Quiz 1 - Practice Test #1 ....html" ...
"""

from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

from course_env import CONTENT, load_paths, write_json

SECTION_DIR = re.compile(r"^(\d{2}) - (.+)$")
LECTURE_FILE = re.compile(r"^(\d{3}) (.+?)(?:_(en|vi))?\.(mp4|srt|html)$")
QUIZ_DATA = re.compile(r"const quizData = (\{.*?\});\s*\n", re.S)
SKIPPED_NOTES = {"Bonus Lecture"}  # promo links only, no exam knowledge


def bi(en: str, vi: str = "") -> dict:
    """Every user-facing string in the content is a bilingual pair."""
    return {"en": en, "vi": vi}


class HtmlSanitizer(HTMLParser):
    """Keeps a small, safe subset of tags so content HTML can be rendered as-is."""

    ALLOWED = {"p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "code", "pre", "a", "img", "h3", "h4"}
    ATTRS = {"a": {"href"}, "img": {"src", "alt"}}
    DROP_WITH_CONTENT = {"script", "style", "footer", "button", "dialog"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.dropping = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.DROP_WITH_CONTENT:
            self.dropping += 1
        if self.dropping or tag not in self.ALLOWED:
            return
        keep = "".join(
            f' {k}="{html.escape(v or "", quote=True)}"'
            for k, v in attrs
            if k in self.ATTRS.get(tag, ()) and not (v or "").lower().startswith("javascript:")
        )
        self.out.append(f"<{tag}{keep}>")

    def handle_endtag(self, tag):
        if tag in self.DROP_WITH_CONTENT:
            self.dropping = max(0, self.dropping - 1)
        elif not self.dropping and tag in self.ALLOWED and tag not in {"br", "img"}:
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.dropping:
            self.out.append(html.escape(data, quote=False))

    @classmethod
    def clean(cls, raw: str) -> str:
        parser = cls()
        parser.feed(raw)
        text = "".join(parser.out)
        text = re.sub(r"<p>\s*</p>", "", text)
        return re.sub(r"\s+", " ", text).strip()


class SrtParser:
    TIME = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)")

    @staticmethod
    def _seconds(h, m, s, ms) -> float:
        return round(int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000, 2)

    @classmethod
    def parse(cls, path: Path) -> list[list]:
        """Returns [[start, end, text], ...]."""
        cues = []
        for block in re.split(r"\r?\n\s*\r?\n", path.read_text(encoding="utf-8-sig")):
            lines = block.strip().splitlines()
            for i, line in enumerate(lines):
                match = cls.TIME.search(line)
                if match:
                    text = " ".join(l.strip() for l in lines[i + 1:]).strip()
                    if text:
                        g = match.groups()
                        cues.append([cls._seconds(*g[:4]), cls._seconds(*g[4:]), text])
                    break
        return cues


class ContentWriter:
    def __init__(self, force: bool) -> None:
        self.force = force
        self.written = self.kept = 0

    def write(self, rel: str, data, *, derived: bool = False) -> None:
        path = CONTENT / rel
        if path.exists() and not (derived or self.force):
            self.kept += 1
            return
        write_json(path, data, indent=None if derived else 1)
        self.written += 1


class CourseImporter:
    def __init__(self, writer: ContentWriter) -> None:
        self.writer = writer

    def run(self) -> None:
        course_dir = load_paths()["COURSE_DIR"]
        for folder in sorted(p for p in course_dir.iterdir() if p.is_dir() and SECTION_DIR.match(p.name)):
            self.import_section(folder)

    def import_section(self, folder: Path) -> None:
        sid, title = SECTION_DIR.match(folder.name).groups()
        lectures: dict[str, dict] = {}
        transcripts: dict[str, dict] = {}
        for file in sorted(folder.iterdir()):
            if file.name.startswith("Quiz "):
                self.import_quiz(file, sid)
                continue
            match = LECTURE_FILE.match(file.name)
            if not match:
                continue
            num, name, lang, ext = match.groups()
            lid = f"{sid}-{num}"
            if ext == "html" and name in SKIPPED_NOTES:
                continue
            lecture = lectures.setdefault(lid, {"id": lid, "title": bi(name), "kind": "video"})
            if ext == "mp4":
                lecture.setdefault("video", f"{folder.name}/{file.name}")
            elif ext == "srt":
                transcripts.setdefault(lid, {})[lang] = SrtParser.parse(file)
            else:
                lecture["kind"] = "note"
                self.import_note(file, sid, lid, name)
        self.writer.write(f"sections/{sid}.json", {
            "id": sid,
            "order": int(sid),
            "title": bi(title),
            "lectures": [self.lecture_entry(lec, transcripts.get(lec["id"])) for lec in lectures.values()],
        })
        for lang in ("en", "vi"):  # subtitles/vi-ai is the hand-made AI rewrite: never written here
            cues = {lid: tracks[lang] for lid, tracks in transcripts.items() if lang in tracks}
            self.writer.write(f"subtitles/{lang}/{sid}.json", cues, derived=True)

    @staticmethod
    def lecture_entry(lecture: dict, tracks: dict | None) -> dict:
        entry = {**lecture, "transcript": bool(tracks)}
        if tracks and tracks.get("en"):  # last cue end ~ video length; the study planner balances days by it
            entry["minutes"] = round(tracks["en"][-1][1] / 60, 1)
        return entry

    def import_note(self, file: Path, sid: str, lid: str, name: str) -> None:
        raw = file.read_text(encoding="utf-8")
        body = HtmlSanitizer.clean(raw[raw.find("<body"):])
        body = re.sub(r"\s*<p>\s*Nguồn:.*$", "", body)  # scraper footer
        body = body.removeprefix(name).strip()  # title is rendered separately
        self.writer.write(f"notes/{lid}.json", {"id": lid, "section": sid, "title": bi(name), "body": bi(body.strip())})

    def import_quiz(self, file: Path, sid: str | None) -> None:
        """sid None = a standalone full exam (--exam), named after "Practice Test #N" in its title."""
        data = json.loads(QUIZ_DATA.search(file.read_text(encoding="utf-8")).group(1))
        is_exam = sid in (None, "13")
        number = re.search(r"Practice Test #(\d+)", data["quiz_title"])
        if sid is None:
            qid = f"practice-test-{number.group(1)}" if number else re.sub(r"[^a-z0-9]+", "-", file.stem.lower()).strip("-")
        else:
            qid = f"exam-{len(data['questions']):02d}" if is_exam else f"section-{sid}"
        questions = []
        for q in data["questions"]:
            prompt = q["prompt"]
            item = {
                "id": q["id"],
                "multi": q["assessment_type"] == "multi-select",
                "question": bi(HtmlSanitizer.clean(prompt["question"])),
                "options": [bi(HtmlSanitizer.clean(a)) for a in prompt["answers"]],
                "answer": [ord(c) - ord("a") for c in q["correct_response"]],
            }
            feedback = [bi(HtmlSanitizer.clean(f)) for f in prompt.get("feedbacks", [])]
            if any(f["en"] for f in feedback):  # some exports leave every per-option feedback blank
                item["feedback"] = feedback
            if prompt.get("explanation"):
                item["explanation"] = bi(HtmlSanitizer.clean(prompt["explanation"]))
            if q.get("section"):
                item["domain"] = q["section"].strip()
            questions.append(item)
        self.writer.write(f"quizzes/{qid}.json", {
            "id": qid,
            "kind": "exam" if is_exam else "section",
            "section": None if is_exam else sid,
            "title": bi(re.sub(r"^Quiz:\s*", "", data["quiz_title"])),
            "description": bi(HtmlSanitizer.clean(data["quiz_description"])),
            "passPercent": data["pass_percent"],
            "questions": questions,
        })


def main() -> None:
    parser = argparse.ArgumentParser(description="Import course folders into app/content JSON.")
    parser.add_argument("--force", action="store_true", help="overwrite hand-edited JSON (loses translations)")
    parser.add_argument("--exam", nargs="+", type=Path, metavar="HTML",
                        help="only import these extra full-exam quiz pages (e.g. 'more ex/*.html')")
    args = parser.parse_args()
    writer = ContentWriter(args.force)
    importer = CourseImporter(writer)
    if args.exam:
        for file in args.exam:
            importer.import_quiz(file, None)
    else:
        importer.run()
    print(f"written {writer.written} files, kept {writer.kept} existing files -> {CONTENT}")


if __name__ == "__main__":
    main()
