// Assert-based self-check for the framework-free domain classes: `npm run check`
import assert from 'node:assert/strict'
import { LeitnerScheduler } from '../src/core/LeitnerScheduler.js'
import { QuizSession } from '../src/core/QuizSession.js'
import { TranscriptTrack } from '../src/core/TranscriptTrack.js'
import { Localizer } from '../src/core/Localizer.js'
import { MistakeCoach } from '../src/core/MistakeCoach.js'
import { StudyPlanner } from '../src/core/StudyPlanner.js'

const now = 1_000_000
assert.equal(LeitnerScheduler.review(undefined, true, now).box, 2)
assert.equal(LeitnerScheduler.review({ box: 5 }, true, now).box, 5)
assert.equal(LeitnerScheduler.review({ box: 4 }, false, now).box, 1)
const sched = new LeitnerScheduler({ a: { box: 3, due: now + 1 }, b: { box: 1, due: 0 } })
const three = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
assert.deepEqual(sched.queue(three, now).map((c) => c.id), ['c', 'b'])
assert.deepEqual(sched.counts(three), [1, 1, 0, 1, 0, 0])

const questions = [
  { id: 1, multi: false, options: ['x', 'y'], answer: [1], domain: 'D1' },
  { id: 2, multi: true, options: ['x', 'y', 'z'], answer: [0, 2], domain: 'D1' },
]
const s = new QuizSession({ id: 'q', questions, passPercent: 50 })
s.choose(0)
s.choose(1)
assert.deepEqual([...s.selectionOf(questions[0])], [1], 'single choice replaces')
s.goTo(1)
for (const i of [0, 2, 2, 2]) s.choose(i)
assert.ok(s.isCorrect(questions[1]), 'multi-select toggles')
const r = s.submit()
assert.equal(r.percent, 100)
assert.deepEqual(r.byDomain, { D1: { correct: 2, total: 2 } })
s.choose(1)
assert.ok(s.isCorrect(questions[1]), 'answers lock after submit')

// an unfinished run survives a save/restore round trip, exam clock included
const run = new QuizSession({ id: 'q', questions, mode: 'exam', passPercent: 50 })
run.choose(1)
run.toggleFlag()
run.goTo(1)
run.choose(2)
const saved = JSON.parse(JSON.stringify(run.snapshot(run.startedAt + 90_000)))
const back = QuizSession.restore({ id: 'q', questions, passPercent: 50 }, saved, 5_000_000)
assert.equal(back.mode, 'exam')
assert.equal(back.index, 1)
assert.deepEqual([...back.selectionOf(questions[0])], [1])
assert.deepEqual([...back.selectionOf(questions[1])], [2])
assert.ok(back.flagged.has(1), 'flags restored with numeric ids')
assert.equal(Math.round(back.secondsLeft(5_000_000)), back.duration - 90, 'clock resumes, not reset')
const pruned = QuizSession.restore({ id: 'q', questions: [questions[1]] }, saved)
assert.equal(pruned.answeredCount, 1, 'answers to removed questions are dropped')

const coach = new MistakeCoach(
  [{ term: 'data lake', lecture: '02-004', section: '02' }, { term: 'Kinesis', lecture: '02-038', section: '02' }, { term: 'lake', lecture: '09-001', section: '09' }],
  [{ id: '02-009', title: { en: 'Amazon S3' } }, { id: '01-001', title: { en: 'Intro' } }],
)
const missed = {
  id: 7,
  question: { en: '<p>Where to keep raw files in a data lake on Amazon S3?</p>' },
  options: [{ en: 'x' }, { en: 'Kinesisx' }],
  answer: [0],
  explanation: { en: '<p>Short.</p><p>A long explanation paragraph that is clearly at least eighty characters long for the advice.</p>', vi: '<p>Ngắn.</p><p>Giải thích.</p>' },
}
assert.deepEqual(coach.related(missed, '02'), ['02-009', '02-004', '09-001'], 'titles weigh most, own section first, whole words only')
assert.match(MistakeCoach.advice(missed).en, /^A long explanation/, 'advice skips short paragraphs')
assert.equal(MistakeCoach.advice({ answer: [0], options: [], explanation: { en: '<p>Short.</p>' } }), null, 'no advice when the exam has none')
assert.equal(MistakeCoach.advice({ answer: [0], feedback: [{ en: '<p>Right because.</p>', vi: '<p>Đúng vì.</p>' }] }).vi, 'Đúng vì.')

const t = new TranscriptTrack([[0, 2, 'a'], [2.5, 4, 'b'], [10, 12, 'c']])
assert.equal(t.textAt(1), 'a')
assert.equal(t.textAt(4.2), 'b')
assert.equal(t.textAt(7), '')
assert.equal(new TranscriptTrack().indexAt(3), -1)

const l = new Localizer('vi', { en: { hi: 'Hi {name}' }, vi: {} })
assert.equal(l.ui('hi', { name: 'A' }), 'Hi A')
assert.equal(l.text({ en: 'E', vi: '' }), 'E')
assert.equal(Localizer.clock(3725), '1:02:05')

const lessons = [{ id: 'a', minutes: 30 }, { id: 'b', minutes: 30 }, { id: 'c', kind: 'note' }, { id: 'd', minutes: 60 }]
const plan = StudyPlanner.plan(lessons, '2026-03-01', '2026-03-10', ['e1', 'e2', 'e3'])
assert.deepEqual(plan.study.map((d) => d.lectures.map((x) => x.id)), [['a', 'b'], ['c', 'd']], 'balanced by minutes, in order')
assert.equal(plan.study[1].date, '2026-03-02')
assert.deepEqual(plan.review.map((d) => d.date), ['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'], 'last 7 days before the exam are review')
assert.deepEqual(plan.review.map((d) => d.exams.length), [1, 0, 0, 1, 0, 0, 1], 'exams spread over the review week')
assert.equal(StudyPlanner.plan(lessons, '2026-03-01', '2026-03-08').error, 'tooShort')
assert.equal(StudyPlanner.addDays('2026-03-28', 2), '2026-03-30', 'no DST drift')

console.log('selfcheck OK')
