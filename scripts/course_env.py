"""Course file locations from the repo-root .env, shared by the import and validate scripts.

The same .env is read by app/vite.config.js, which serves these folders to the browser.
Relative paths are resolved from the repo root; absolute paths are used as they are.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "app" / "content"
QUIZZES = CONTENT / "quizzes"
KEYS = ("COURSE_DIR", "MATERIALS_DIR", "SLIDES_FILE")


def write_json(path: Path, data, indent: int | None = 1) -> None:
    """Content JSON as the app reads it: UTF-8, Vietnamese kept readable."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding="utf-8")


def load_paths() -> dict[str, Path]:
    env_file = ROOT / ".env"
    if not env_file.exists():
        raise SystemExit(f"{env_file} not found: copy .env.example to .env and set the course paths.")
    values = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            values[key.strip()] = value.strip().strip("\"'")
    missing = [k for k in KEYS if not values.get(k)]
    if missing:
        raise SystemExit(f"{env_file}: missing {', '.join(missing)} (see .env.example).")
    return {k: (ROOT / values[k]).resolve() for k in KEYS}
