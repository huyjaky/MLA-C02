import { QuizSession } from './QuizSession.js'

/**
 * Survival: questions of one level until the lives run out. A right answer grows the streak and the
 * score (longer streaks pay more); a wrong one costs a life and resets the streak. Hardcore: one life.
 */
export class SurvivalRun extends QuizSession {
  static LIVES = { easy: 5, medium: 3, hard: 2 }
  static POINTS = { easy: 10, medium: 20, hard: 35 }
  static MAX_STREAK_BONUS = 2 // a long streak pays at most 3x

  constructor({ questions, level, hardcore = false }) {
    super({ id: `survival-${level}`, questions })
    this.level = level
    this.hardcore = hardcore
    this.lives = hardcore ? 1 : SurvivalRun.LIVES[level]
    this.score = 0
    this.streak = 0
    this.bestStreak = 0
    this.correctCount = 0
  }

  /** Leaderboard key: easy, medium, hard, or with -hardcore. */
  get boardMode() {
    return SurvivalRun.modeKey(this.level, this.hardcore)
  }

  static modeKey(level, hardcore) {
    return hardcore ? `${level}-hardcore` : level
  }

  get isOver() {
    return this.lives === 0 || (this.isRevealed(this.current) && this.index === this.questions.length - 1)
  }

  /** Reveal the current answer and score it once; returns whether it was right (null if nothing picked). */
  check() {
    const q = this.current
    if (this.isRevealed(q) || !this.selectionOf(q).size) return null
    super.check()
    const right = this.isCorrect(q)
    if (right) {
      this.streak++
      this.correctCount++
      this.bestStreak = Math.max(this.bestStreak, this.streak)
      this.score += Math.round(SurvivalRun.POINTS[this.level] * (1 + Math.min((this.streak - 1) * 0.1, SurvivalRun.MAX_STREAK_BONUS)))
    } else {
      this.streak = 0
      this.lives--
    }
    return right
  }

  next() {
    if (!this.isOver) this.goTo(this.index + 1)
  }
}
