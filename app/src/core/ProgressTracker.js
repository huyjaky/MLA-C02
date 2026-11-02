import { PersistentStore } from './PersistentStore'
import { LeitnerScheduler } from './LeitnerScheduler'

const RESUME_MIN = 10 // seconds: earlier than this, starting over costs nothing
const RESUME_END_MARGIN = 15 // seconds: this close to the end counts as finished

const DEFAULTS = {
  settings: { lang: 'vi', dual: false, theme: 'system', captions: 'both' },
  lectures: {}, // lecture id -> completed at (ms)
  quizzes: {}, // quiz id -> { best, attempts: [{ correct, total, percent, mode, at }] }
  mistakes: {}, // question id -> quiz id, until answered correctly
  leitner: {}, // card id -> { box, due }
  subDelays: {}, // lecture id -> subtitle delay in seconds (+ = subtitles later)
  positions: {}, // lecture id -> { t, d, at }: last playback second, duration, saved at (ms)
  lastLecture: null,
  schedule: null, // { start, exam } as 'YYYY-MM-DD'
  planView: null, // study plan page: { open: [expanded dates], lecture: last lecture opened from it }
}

/** One account's progress and preferences; `persist` saves them to that account on the server. */
export class ProgressTracker extends PersistentStore {
  constructor(initial, persist) {
    super(DEFAULTS, initial, persist)
  }

  setSetting(name, value) {
    this.update('settings', (s) => ({ ...s, [name]: value }))
  }

  openLecture(id) {
    if (this.state.lastLecture !== id) this.update('lastLecture', () => id)
  }

  completeLecture(id, done = true) {
    this.update('lectures', (all) => {
      const { [id]: _, ...rest } = all
      return done ? { ...all, [id]: Date.now() } : rest
    })
  }

  isLectureDone(id) {
    return Boolean(this.state.lectures[id])
  }

  /** Completed / total lectures of a section. */
  sectionProgress(section) {
    const done = section.lectures.filter((l) => this.isLectureDone(l.id)).length
    return { done, total: section.lectures.length, ratio: section.lectures.length ? done / section.lectures.length : 0 }
  }

  recordQuiz(quizId, mode, result) {
    const attempt = { correct: result.correct, total: result.total, percent: result.percent, mode, at: Date.now() }
    this.update('quizzes', (all) => {
      const prev = all[quizId] ?? { best: 0, attempts: [] }
      return { ...all, [quizId]: { best: Math.max(prev.best, result.percent), attempts: [...prev.attempts, attempt].slice(-20) } }
    })
    this.update('mistakes', (all) => {
      const next = { ...all }
      result.rightIds.forEach((id) => delete next[id])
      result.wrongIds.forEach((id) => (next[id] = quizId))
      return next
    })
  }

  /** Unfinished attempt of a quiz (a QuizSession snapshot), or null. */
  quizRun(quizId) {
    return this.state.quizRuns?.[quizId] ?? null
  }

  saveQuizRun(quizId, snapshot) {
    this.update('quizRuns', (all = {}) => ({ ...all, [quizId]: snapshot }))
  }

  clearQuizRun(quizId) {
    if (!this.quizRun(quizId)) return
    this.update('quizRuns', (all = {}) => {
      const { [quizId]: _, ...rest } = all
      return rest
    })
  }

  /** Forget all scores, missed questions and unfinished attempts; lectures and flashcards are kept. */
  clearExamHistory() {
    for (const slice of ['quizzes', 'mistakes', 'quizRuns']) this.update(slice, () => ({}))
  }

  quizStats(quizId) {
    return this.state.quizzes[quizId] ?? null
  }

  subDelay(lectureId) {
    return this.state.subDelays?.[lectureId] ?? 0
  }

  setSubDelay(lectureId, seconds) {
    const value = Math.round(seconds * 100) / 100 // keep 0.25 steps free of float drift
    this.update('subDelays', (all = {}) => {
      const { [lectureId]: _, ...rest } = all
      return value ? { ...rest, [lectureId]: value } : rest
    })
  }

  savePosition(lectureId, seconds, duration) {
    const record = { t: Math.floor(seconds), d: Math.floor(duration), at: Date.now() }
    this.update('positions', (all = {}) => ({ ...all, [lectureId]: record }))
  }

  /** Saved spot to continue a lecture from, or null when it was barely started or already finished. */
  resumePoint(lectureId) {
    const p = this.state.positions?.[lectureId]
    return p && p.t >= RESUME_MIN && p.t < p.d - RESUME_END_MARGIN ? p : null
  }

  /** 0..1 share of a lecture watched; marked-done lectures count as 1. */
  watchRatio(lectureId) {
    if (this.isLectureDone(lectureId)) return 1
    const p = this.state.positions?.[lectureId]
    return p?.d ? Math.min(p.t / p.d, 1) : 0
  }

  setSchedule(schedule) {
    this.update('schedule', () => schedule)
  }

  setPlanView(view) {
    this.update('planView', () => view)
  }

  get mistakeIds() {
    return Object.keys(this.state.mistakes)
  }

  get scheduler() {
    return new LeitnerScheduler(this.state.leitner)
  }

  reviewCard(cardId, known) {
    this.update('leitner', (all) => ({ ...all, [cardId]: LeitnerScheduler.review(all[cardId], known) }))
  }
}
