"""Download the images that quiz questions link to, so they work offline and can be copied.

Most quiz images live on CDNs without CORS headers, which stops the browser from reading
their bytes (needed for "copy image"). This saves each external <img src> to
app/public/quiz-images/<hash>.<ext> and points the quiz JSON at that local file.
Safe to run again: already-local images are left alone.

Usage:  python scripts/localize_images.py
"""

from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from pathlib import Path

from course_env import QUIZZES, ROOT, write_json

IMAGES = ROOT / "app" / "public" / "quiz-images"
IMG_SRC = re.compile(r'(<img\b[^>]*\bsrc=")(https?://[^"]+)(")')
EXTENSIONS = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg"}


class ImageLocalizer:
    def __init__(self) -> None:
        self.local: dict[str, str] = {}  # remote url -> local src
        self.failed: list[str] = []

    def fetch(self, url: str) -> str | None:
        if url in self.local:
            return self.local[url]
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                kind = response.headers.get_content_type()
                if kind not in EXTENSIONS:
                    raise ValueError(f"not an image ({kind})")
                data = response.read()
        except Exception as exc:  # keep the remote link when a download fails
            self.failed.append(f"{url}: {exc}")
            return None
        name = hashlib.sha1(url.encode()).hexdigest()[:12] + EXTENSIONS[kind]
        IMAGES.mkdir(parents=True, exist_ok=True)
        (IMAGES / name).write_bytes(data)
        self.local[url] = f"quiz-images/{name}"
        return self.local[url]

    def rewrite(self, html: str) -> str:
        return IMG_SRC.sub(lambda m: m.group(1) + (self.fetch(m.group(2)) or m.group(2)) + m.group(3), html)

    def walk(self, node):
        if isinstance(node, str):
            return self.rewrite(node)
        if isinstance(node, list):
            return [self.walk(v) for v in node]
        if isinstance(node, dict):
            return {k: self.walk(v) for k, v in node.items()}
        return node

    def run(self) -> None:
        for path in sorted(QUIZZES.glob("*.json")):
            original = json.loads(path.read_text(encoding="utf-8"))
            updated = self.walk(json.loads(json.dumps(original)))  # walk rewrites in place: give it a copy
            if updated != original:
                write_json(path, updated)
                print(f"updated {path.name}")
        print(f"{len(self.local)} images saved to {IMAGES}")
        for line in self.failed:
            print("FAILED", line)


if __name__ == "__main__":
    ImageLocalizer().run()
