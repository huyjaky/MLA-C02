const DAY = 86_400_000

/** 'YYYY-MM-DD' <-> UTC midnight ms, so day arithmetic never trips over daylight saving. */
const toMs = (date) => Date.parse(`${date}T00:00:00Z`)
const toDate = (ms) => new Date(ms).toISOString().slice(0, 10)

/**
 * Spreads the lectures over the days from `start` up to the review week before `exam`,
 * balanced by video length, in course order; the last REVIEW_DAYS days go to practice exams.
 */
export class StudyPlanner {
  static REVIEW_DAYS = 7

  /** Minutes a lecture takes; notes and videos without subtitles get a rough guess. */
  static minutes(lecture) {
    return lecture.minutes ?? (lecture.kind === 'video' ? 8 : 2)
  }

  /** Local calendar date as 'YYYY-MM-DD'. */
  static today(now = new Date()) {
    return toDate(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  }

  static addDays(date, n) {
    return toDate(toMs(date) + n * DAY)
  }

  /**
   * { study: [{ date, lectures, minutes }], review: [{ date, exams }], examDate }
   * or { error: 'invalid' | 'tooShort' } when there is no day left to study.
   */
  static plan(lectures, start, exam, exams = []) {
    if (!toMs(start) || !toMs(exam)) return { error: 'invalid' }
    const studyDays = Math.round((toMs(exam) - toMs(start)) / DAY) - StudyPlanner.REVIEW_DAYS
    if (studyDays < 1) return { error: 'tooShort' }

    const study = Array.from({ length: studyDays }, (_, i) => ({ date: StudyPlanner.addDays(start, i), lectures: [], minutes: 0 }))
    const total = lectures.reduce((sum, l) => sum + StudyPlanner.minutes(l), 0)
    let before = 0
    for (const lecture of lectures) {
      const m = StudyPlanner.minutes(lecture)
      // the day whose share of the total holds this lecture's midpoint: keeps order and evens out the load
      const day = study[Math.min(studyDays - 1, Math.floor(((before + m / 2) / total) * studyDays))]
      day.lectures.push(lecture)
      day.minutes += m
      before += m
    }

    const reviewStart = StudyPlanner.addDays(start, studyDays)
    const review = Array.from({ length: StudyPlanner.REVIEW_DAYS }, (_, i) => ({ date: StudyPlanner.addDays(reviewStart, i), exams: [] }))
    const last = StudyPlanner.REVIEW_DAYS - 1
    exams.forEach((quiz, j) => review[exams.length > 1 ? Math.round((j * last) / (exams.length - 1)) : last].exams.push(quiz))
    return { study, review, examDate: exam }
  }
}
