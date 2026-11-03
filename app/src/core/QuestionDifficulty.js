import { plainText } from './plainText.js'

const HARD_STEM_CHARS = 620 // about the top 40% of exam scenarios by length
const stemLength = (question) => plainText(question.question?.en).length

/**
 * Easy / medium / hard for every quiz question. The course does not grade them, so: section quizzes
 * are short recall checks (easy); exam scenarios are medium, and multi-select or long ones hard.
 */
export class QuestionDifficulty {
  static LEVELS = ['easy', 'medium', 'hard']

  static of(question, quiz) {
    if (quiz.kind === 'section') return 'easy'
    return question.multi || stemLength(question) > HARD_STEM_CHARS ? 'hard' : 'medium'
  }

  /** { easy: [question], medium: [...], hard: [...] } over all quizzes. */
  static pools(quizzes) {
    const pools = Object.fromEntries(QuestionDifficulty.LEVELS.map((level) => [level, []]))
    quizzes.forEach((quiz) => quiz.questions.forEach((q) => pools[QuestionDifficulty.of(q, quiz)].push(q)))
    return pools
  }
}
