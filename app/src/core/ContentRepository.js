// Every JSON file dropped into these folders is picked up automatically: no index to maintain.
const sectionFiles = import.meta.glob('../../content/sections/*.json', { eager: true, import: 'default' })
const quizFiles = import.meta.glob('../../content/quizzes/*.json', { eager: true, import: 'default' })
const noteFiles = import.meta.glob('../../content/notes/*.json', { eager: true, import: 'default' })
const glossaryFiles = import.meta.glob('../../content/glossary/*.json', { eager: true, import: 'default' })
const uiFiles = import.meta.glob('../../content/ui/*.json', { eager: true, import: 'default' })
import course from '../../content/course.json'
import { MistakeCoach } from './MistakeCoach'

// Large per-section files ({ lectureId: entry }), loaded only when a lecture asks for them.
const lazySectionFiles = {
  transcripts: import.meta.glob('../../content/transcripts/*.json', { import: 'default' }),
  summaries: import.meta.glob('../../content/summaries/*.json', { import: 'default' }),
  'transcripts-ai': import.meta.glob('../../content/transcripts-ai/*.json', { import: 'default' }),
}

const byOrder = (a, b) => a.order - b.order
const fileName = (path) => path.split('/').pop().replace('.json', '')

/** Read-only access to all course content, with lookups the pages need. */
export class ContentRepository {
  constructor() {
    this.sections = Object.values(sectionFiles).sort(byOrder)
    this.quizzes = Object.values(quizFiles).sort(
      (a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'section' ? -1 : 1),
    )
    this.notes = Object.values(noteFiles).sort((a, b) => a.id.localeCompare(b.id))
    this.terms = Object.values(glossaryFiles).flatMap((g) => g.terms.map((t) => ({ ...t, section: g.section })))
    this.dictionaries = Object.fromEntries(Object.entries(uiFiles).map(([path, dict]) => [fileName(path), dict]))

    this.lectureIndex = new Map()
    this.sections.forEach((section) =>
      section.lectures.forEach((lecture, i) => this.lectureIndex.set(lecture.id, { lecture, section, i })),
    )
    this.questionIndex = new Map()
    this.quizzes.forEach((quiz) => quiz.questions.forEach((q) => this.questionIndex.set(q.id, { question: q, quiz })))
    this.lazyCache = new Map()
    this.coach = new MistakeCoach(this.terms, [...this.lectureIndex.values()].map((e) => e.lecture))
    this.slides = course.slides
  }

  /** Sections that hold lectures (the practice-test folder has none). */
  get studySections() {
    return this.sections.filter((s) => s.lectures.length)
  }

  get lectureCount() {
    return this.lectureIndex.size
  }

  section(id) {
    return this.sections.find((s) => s.id === id)
  }

  /** Lecture with its section and neighbours across the whole course. */
  lecture(id) {
    const entry = this.lectureIndex.get(id)
    if (!entry) return null
    const ids = [...this.lectureIndex.keys()]
    const at = ids.indexOf(id)
    return { ...entry, prev: ids[at - 1] ?? null, next: ids[at + 1] ?? null }
  }

  quiz(id) {
    return this.quizzes.find((q) => q.id === id)
  }

  quizzesFor(sectionId) {
    return this.quizzes.filter((q) => q.section === sectionId)
  }

  notesFor(sectionId) {
    return this.notes.filter((n) => n.section === sectionId)
  }

  termsFor(sectionId) {
    return this.terms.filter((t) => t.section === sectionId)
  }

  /** Lecture ids worth rewatching for a question. */
  relatedLectures(question) {
    return this.coach.related(question, this.questionIndex.get(question.id)?.quiz.section)
  }

  questionsByIds(ids) {
    return ids.map((id) => this.questionIndex.get(Number(id))?.question).filter(Boolean)
  }

  /** A lecture's entry from a lazily loaded per-section file (each file is fetched once). */
  async #lectureEntry(folder, lectureId) {
    const key = `${folder}/${lectureId.slice(0, 2)}`
    if (!this.lazyCache.has(key)) {
      const load = lazySectionFiles[folder][`../../content/${key}.json`]
      this.lazyCache.set(key, load ? load() : Promise.resolve({}))
    }
    return (await this.lazyCache.get(key))[lectureId]
  }

  /** { en, vi, ai } subtitle cue lists for a lecture; ai is the natural rewrite, kept apart from the original vi. */
  async transcript(lectureId) {
    const [cues, ai] = await Promise.all([this.#lectureEntry('transcripts', lectureId), this.#lectureEntry('transcripts-ai', lectureId)])
    return { ...cues, ai }
  }

  /** { tldr, points, services, funFact?, diagram? } for a lecture, or null when none was written. */
  async summary(lectureId) {
    return (await this.#lectureEntry('summaries', lectureId)) ?? null
  }

  /** Flashcards: glossary terms plus every quiz question (question on the front, answer on the back). */
  flashcards() {
    const termCards = this.terms.map((t) => ({ id: `term:${t.section}:${t.id}`, kind: 'term', section: t.section, term: t }))
    const questionCards = this.quizzes.flatMap((quiz) =>
      quiz.questions.map((q) => ({ id: `q:${q.id}`, kind: 'question', section: quiz.section ?? 'exam', question: q })),
    )
    return [...termCards, ...questionCards]
  }
}
