import { PersistentStore } from './PersistentStore.js'
import { LeitnerScheduler } from './LeitnerScheduler.js'

const RESUME_MIN = 10 // seconds: earlier than this, starting over costs nothing
const RESUME_END_MARGIN = 15 // seconds: this close to the end counts as finished
const MAX_RUNS = 10 // unfinished attempts kept per quiz; the oldest goes first

const DEFAULTS = {
  settings: { lang: 'vi', dual: false, theme: 'system', captions: 'both' },
  lectures: {}, // lecture id -> completed at (ms)
  quizzes: {}, // quiz id -> { best, attempts: [{ correct, total, percent, mode, at }] }
  quizRuns: {}, // quiz id -> unfinished QuizSession snapshots [{ id, ...snapshot }], newest first
  mistakes: {}, // question id -> quiz id, until answered correctly
  leitner: {}, // card id -> { box, due }
  subDelays: {}, // lecture id -> subtitle delay in seconds (+ = subtitles later)
  positions: {}, // lecture id -> { t, d, at }: last playback second, duration, saved at (ms)
  lastLecture: null,
  schedule: null, // { start, exam } as 'YYYY-MM-DD'
  planView: null, // study plan page: { open: [expanded dates], lecture: last lecture opened from it, stars: starred-only filter }
  stars: {}, // lecture id -> starred at (ms): lectures the learner flagged as important
}

const BACKUP_FORMAT = 'mla-study-progress'
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** One account's progress and preferences; `persist` saves them to that account on the server. */
export class ProgressTracker extends PersistentStore {
  constructor(initial, persist) {
    super(DEFAULTS, initial, persist)
  }

  /** Contents of a backup file holding everything this account has done. */
  exportData() {
    return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), state: this.state }
  }

  /** Replace all progress with a backup from exportData; throws, changing nothing, when the file is not one. */
  importData(backup) {
    if (backup?.format !== BACKUP_FORMAT || !isPlainObject(backup.state)) throw new Error('notBackup')
    const next = {}
    for (const [slice, fallback] of Object.entries(DEFAULTS)) {
      const value = backup.state[slice] ?? fallback
      // map slices must stay objects; the nullable ones (lastLecture, schedule, planView) take a string or an object
      const ok = isPlainObject(fallback) ? isPlainObject(value) : value === null || typeof value === 'string' || isPlainObject(value)
      if (!ok) throw new Error('notBackup')
      next[slice] = slice === 'settings' ? { ...DEFAULTS.settings, ...value } : value
    }
    Object.entries(next).forEach(([slice, value]) => this.update(slice, () => value))
    return this.flush()
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

  /** Unfinished attempts of a quiz, newest first: QuizSession snapshots plus their run `id`. */
  savedRuns(quizId) {
    const runs = this.state.quizRuns?.[quizId]
    if (!runs) return []
    // progress saved before several runs per quiz were kept holds one bare snapshot
    return Array.isArray(runs) ? runs : [{ ...runs, id: runs.savedAt ?? 0 }]
  }

  saveQuizRun(quizId, runId, snapshot) {
    const runs = [{ ...snapshot, id: runId }, ...this.savedRuns(quizId).filter((r) => r.id !== runId)].slice(0, MAX_RUNS)
    this.update('quizRuns', (all = {}) => ({ ...all, [quizId]: runs }))
  }

  deleteQuizRun(quizId, runId) {
    const runs = this.savedRuns(quizId)
    if (!runs.some((r) => r.id === runId)) return
    this.update('quizRuns', (all = {}) => {
      const { [quizId]: _, ...rest } = all
      const left = runs.filter((r) => r.id !== runId)
      return left.length ? { ...rest, [quizId]: left } : rest
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

  isStarred(lectureId) {
    return Boolean(this.state.stars?.[lectureId])
  }

  toggleStar(lectureId) {
    this.update('stars', (all = {}) => {
      const { [lectureId]: had, ...rest } = all
      return had ? rest : { ...all, [lectureId]: Date.now() }
    })
  }

  get mistakeIds() {
    return Object.keys(this.state.mistakes)
  }

  /** Scheduler over the current Leitner records; rebuilt only when a review changes them, so memos can key on it. */
  get scheduler() {
    if (this.cachedScheduler?.records !== this.state.leitner) this.cachedScheduler = new LeitnerScheduler(this.state.leitner)
    return this.cachedScheduler
  }

  reviewCard(cardId, known) {
    this.update('leitner', (all) => ({ ...all, [cardId]: LeitnerScheduler.review(all[cardId], known) }))
  }
}
