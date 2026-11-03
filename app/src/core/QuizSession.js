/**
 * One run through a list of questions, in practice mode (reveal per question)
 * or exam mode (timed, reveal everything on submit). Mutable; the UI re-renders
 * after each call through useMutable().
 */
export class QuizSession {
  static SECONDS_PER_QUESTION = 120 // MLA-C01: 65 questions in 130 minutes

  constructor({ id, questions, mode = 'practice', passPercent = 70 }) {
    this.id = id
    this.questions = questions
    this.mode = mode
    this.passPercent = passPercent
    this.index = 0
    this.selections = new Map() // question id -> Set of option indexes
    this.checked = new Set()
    this.flagged = new Set()
    this.submitted = false
    this.startedAt = Date.now()
    this.duration = questions.length * QuizSession.SECONDS_PER_QUESTION
  }

  /** Plain data to save an unfinished run; answers are keyed by question id so edited content stays safe. */
  snapshot(now = Date.now()) {
    return {
      mode: this.mode,
      index: this.index,
      selections: Object.fromEntries([...this.selections].map(([id, picks]) => [id, [...picks]])),
      checked: [...this.checked],
      flagged: [...this.flagged],
      elapsed: Math.round((now - this.startedAt) / 1000),
      savedAt: now,
    }
  }

  /** A session continued from snapshot(); the exam clock resumes where it stopped (it does not run while away). */
  static restore(options, saved, now = Date.now()) {
    const session = new QuizSession({ ...options, mode: saved.mode })
    const known = new Map(session.questions.map((q) => [String(q.id), q.id]))
    for (const [id, picks] of Object.entries(saved.selections ?? {})) {
      if (known.has(id)) session.selections.set(known.get(id), new Set(picks))
    }
    const keep = (ids = []) => new Set(ids.filter((id) => known.has(String(id))).map((id) => known.get(String(id))))
    session.checked = keep(saved.checked)
    session.flagged = keep(saved.flagged)
    session.goTo(saved.index ?? 0)
    session.startedAt = now - (saved.elapsed ?? 0) * 1000
    return session
  }

  get current() {
    return this.questions[this.index]
  }

  get isExam() {
    return this.mode === 'exam'
  }

  get answeredCount() {
    return this.questions.filter((q) => this.selectionOf(q).size > 0).length
  }

  selectionOf(question) {
    return this.selections.get(question.id) ?? new Set()
  }

  isRevealed(question) {
    return this.submitted || this.checked.has(question.id)
  }

  isCorrect(question) {
    return QuizSession.matches(question, this.selectionOf(question))
  }

  /** True when the picked option indexes are exactly the question's answer. */
  static matches(question, picked) {
    const set = new Set(picked)
    return set.size === question.answer.length && question.answer.every((i) => set.has(i))
  }

  /** Single choice replaces the pick; multi-select toggles it. */
  choose(option) {
    const q = this.current
    if (this.isRevealed(q)) return
    const next = new Set(q.multi ? this.selectionOf(q) : [])
    if (q.multi && next.has(option)) next.delete(option)
    else next.add(option)
    this.selections.set(q.id, next)
  }

  check() {
    if (this.selectionOf(this.current).size) this.checked.add(this.current.id)
  }

  toggleFlag() {
    const id = this.current.id
    if (!this.flagged.delete(id)) this.flagged.add(id)
  }

  goTo(index) {
    this.index = Math.min(Math.max(index, 0), this.questions.length - 1)
  }

  secondsLeft(now = Date.now()) {
    return this.duration - (now - this.startedAt) / 1000
  }

  submit() {
    this.submitted = true
    return this.result()
  }

  /** Score, per-domain breakdown and right/wrong ids, judging every question once. */
  result() {
    const rightIds = []
    const wrongIds = []
    const byDomain = {}
    for (const q of this.questions) {
      const right = this.isCorrect(q)
      ;(right ? rightIds : wrongIds).push(q.id)
      if (!q.domain) continue
      const d = (byDomain[q.domain] ??= { correct: 0, total: 0 })
      d.total++
      if (right) d.correct++
    }
    const percent = Math.round((rightIds.length / this.questions.length) * 100)
    return {
      correct: rightIds.length,
      total: this.questions.length,
      percent,
      passed: percent >= this.passPercent,
      rightIds,
      wrongIds,
      byDomain,
    }
  }
}
