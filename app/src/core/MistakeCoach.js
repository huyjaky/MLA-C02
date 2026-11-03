import { plainText as plain } from './plainText.js'

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Study help for a missed question. The exam files link no lectures, so related lectures are found by
 * which glossary terms and lecture titles the question talks about. Advice comes only from the exam's own text.
 */
export class MistakeCoach {
  static MIN_TITLE_LENGTH = 6 // short titles ("Intro") match too much text

  /** terms: [{ term, lecture, section }], lectures: [{ id, title: { en } }] */
  constructor(terms, lectures) {
    this.matchers = [
      ...terms.filter((t) => t.lecture).map((t) => ({ lecture: t.lecture, section: t.section, weight: 1, pattern: this.#pattern(t.term) })),
      ...lectures
        .filter((l) => l.title.en.length >= MistakeCoach.MIN_TITLE_LENGTH)
        .map((l) => ({ lecture: l.id, section: l.id.slice(0, 2), weight: 3, pattern: this.#pattern(l.title.en) })),
    ]
    this.cache = new Map()
  }

  #pattern(text) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(text.toLowerCase())}($|[^a-z0-9])`)
  }

  /** Lecture ids most related to a question, best first; a quiz's own section counts extra. */
  related(question, section = null, limit = 3) {
    if (this.cache.has(question.id)) return this.cache.get(question.id)
    const parts = [question.question, ...question.answer.map((i) => question.options[i]), question.explanation]
    const text = parts.map((p) => plain(p?.en)).join(' ').toLowerCase()
    const scores = new Map()
    for (const { lecture, section: from, weight, pattern } of this.matchers) {
      if (pattern.test(text)) scores.set(lecture, (scores.get(lecture) ?? 0) + weight + (from === section ? 1 : 0))
    }
    const ids = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([id]) => id)
    this.cache.set(question.id, ids)
    return ids
  }

  /** { en, vi } advice from the exam: feedback on the right answer, else the explanation's first real paragraph; or null. */
  static advice(question) {
    const feedback = question.answer.map((i) => question.feedback?.[i]).find((f) => f?.en?.trim())
    if (feedback) return { en: plain(feedback.en), vi: plain(feedback.vi) }
    const paragraph = (html = '') => plain((html.match(/<p>.*?<\/p>/g) ?? []).find((p) => plain(p).length >= 80))
    const en = paragraph(question.explanation?.en)
    return en ? { en, vi: paragraph(question.explanation?.vi) } : null
  }
}
