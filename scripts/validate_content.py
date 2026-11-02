"""Validate app/content JSON after adding or translating content.

Checks every bilingual {"en","vi"} pair is filled in, that the Vietnamese
side keeps the same HTML tags as the English side, and that quiz answers
point at real options. Exit code 1 when anything is wrong.

Usage:  python scripts/validate_content.py [file-or-folder ...]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from course_env import ROOT, load_paths

CONTENT = ROOT / "app" / "content"
TAG = re.compile(r"</?([a-z0-9]+)")
SKIP = {"subtitles"}  # one language per file, not {en, vi} pairs


class ContentValidator:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.paths = load_paths()
        if not self.paths["SLIDES_FILE"].is_file():
            self.errors.append(f".env SLIDES_FILE not found: {self.paths['SLIDES_FILE']}")

    def check_file(self, path: Path) -> None:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            self.errors.append(f"{path.name}: invalid JSON ({exc})")
            return
        self.walk(data, path.relative_to(CONTENT).as_posix())
        if path.parent.name == "quizzes":
            self.check_quiz(data, path.name)
        if path.parent.name == "glossary":
            self.check_glossary(data, path.name)
        if path.parent.name == "sections":
            self.check_materials(data, path.name)
        if path.parent.name == "summaries":
            self.check_summaries(data, path.name)

    DIAGRAM_TYPES = ("flowchart", "graph", "sequenceDiagram", "stateDiagram", "classDiagram", "mindmap", "timeline")

    def check_summaries(self, summaries: dict, name: str) -> None:
        for lid, s in summaries.items():
            where = f"{name} {lid}"
            if not re.fullmatch(r"\d{2}-\d{3}", lid):
                self.errors.append(f"{where}: key must be a lecture id like 02-004")
            if not s.get("tldr"):
                self.errors.append(f"{where}: missing tldr")
            if not 2 <= len(s.get("points", [])) <= 6:
                self.errors.append(f"{where}: needs 2-6 points")
            for svc in s.get("services", []):
                if not svc.get("name") or not svc.get("use"):
                    self.errors.append(f"{where}: each service needs name and use")
            for lang, code in (s.get("diagram") or {}).items():
                if not code.lstrip().startswith(self.DIAGRAM_TYPES):
                    self.errors.append(f"{where}: diagram.{lang} must start with a Mermaid type ({', '.join(self.DIAGRAM_TYPES)})")

    def walk(self, node, where: str) -> None:
        if isinstance(node, dict) and set(node) == {"en", "vi"}:
            en, vi = node["en"], node["vi"]
            if en.strip() and not vi.strip():
                self.errors.append(f"{where}: missing vi")
            elif TAG.findall(en) != TAG.findall(vi):
                self.errors.append(f"{where}: vi HTML tags differ from en")
        elif isinstance(node, dict):
            for key, value in node.items():
                self.walk(value, f"{where}.{key}")
        elif isinstance(node, list):
            for i, value in enumerate(node):
                self.walk(value, f"{where}[{i}]")

    def check_quiz(self, quiz: dict, name: str) -> None:
        for q in quiz["questions"]:
            n = len(q["options"])
            if not q["answer"] or any(not 0 <= a < n for a in q["answer"]):
                self.errors.append(f"{name} q{q['id']}: answer index out of range")
            if q["multi"] != (len(q["answer"]) > 1):
                self.errors.append(f"{name} q{q['id']}: 'multi' does not match answer count")
            if q.get("feedback") and len(q["feedback"]) != n:
                self.errors.append(f"{name} q{q['id']}: feedback count != option count")

    def check_materials(self, section: dict, name: str) -> None:
        materials_dir = self.paths["MATERIALS_DIR"]
        for lecture in section["lectures"]:
            for rel in lecture.get("materials", []):
                if ".." in rel or not (materials_dir / rel).is_file():
                    self.errors.append(f"{name} {lecture['id']}: material not found in MATERIALS_DIR: {rel}")

    def check_glossary(self, glossary: dict, name: str) -> None:
        ids = [t["id"] for t in glossary["terms"]]
        if len(ids) != len(set(ids)):
            self.errors.append(f"{name}: duplicate term ids")

    def run(self, targets: list[Path]) -> int:
        for target in targets:
            files = [target] if target.is_file() else sorted(target.rglob("*.json"))
            for f in files:
                if not SKIP & set(f.relative_to(CONTENT).parts):
                    self.check_file(f)
        print("\n".join(self.errors) or "content OK")
        return 1 if self.errors else 0


if __name__ == "__main__":
    args = [Path(a).resolve() for a in sys.argv[1:]] or [CONTENT]
    sys.exit(ContentValidator().run(args))
