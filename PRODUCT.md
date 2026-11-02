# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite, run from the `mla-c01` conda environment (Python 3.12 for the content importer, Node 22 for the app). Static, local-only; no backend.

## Users

One learner (the owner of this course download), a Vietnamese engineer preparing for the AWS Certified Machine Learning Engineer – Associate (MLA-C01) exam. Studies mainly on a laptop/desktop, in focused sessions, switching between English and Vietnamese.

## Product Purpose

Turn a downloaded video course (14 sections, ~300 lectures with EN/VI subtitles, 11 section quizzes, two practice exams, instructor notes) into one place to study and self-test. Success: the learner can watch a lecture with synced bilingual transcript, drill concepts as flashcards, take quizzes and timed practice exams, and see which areas are weak.

## Positioning

Built from the learner's own course material, fully bilingual EN/VI side by side — exam questions stay faithful to the English exam wording while the Vietnamese is always one toggle away.

## Operating Context

Local machine. Course media lives in `NN - Section/` folders next to `app/`. All content is JSON under `app/content/`, added or edited by hand or regenerated with `scripts/import_course.py`, then checked with `scripts/validate_content.py`.

## Capabilities and Constraints

- Lessons: local mp4 playback with EN/VI transcript synced to playback, click-to-seek.
- Quizzes: per-section quizzes (10 q) and practice exams (20 q, 65 q; single and multi-select), per-option feedback and explanations.
- Flashcards: glossary terms per section plus quiz-derived cards, spaced repetition.
- Notes: instructor notes from the course's .html lectures.
- Progress kept in browser localStorage only.
- Terminology: AWS service, API, algorithm and metric names stay in English in both languages.

## Evidence on Hand

Course content only (videos, subtitles, quiz JSON, notes). No testimonials, scores or claims to show. Practice exams note that MLA-C02 replaces MLA-C01 after September 2026.

## Product Principles

1. Exam fidelity first: questions, answers and explanations are never altered in meaning.
2. Bilingual everywhere, English and Vietnamese equally first-class.
3. Content is data: adding a question or term means editing JSON, not code.
4. Show weakness honestly: progress reflects real answers, not activity.
