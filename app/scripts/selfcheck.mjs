// Assert-based self-check for the framework-free domain classes: `npm run check`
import assert from 'node:assert/strict'
import { LeitnerScheduler } from '../src/core/LeitnerScheduler.js'
import { QuizSession } from '../src/core/QuizSession.js'
import { TranscriptTrack } from '../src/core/TranscriptTrack.js'
import { Localizer } from '../src/core/Localizer.js'
import { MistakeCoach } from '../src/core/MistakeCoach.js'
import { StudyPlanner } from '../src/core/StudyPlanner.js'
import { ProgressTracker } from '../src/core/ProgressTracker.js'
import { QuestionDifficulty } from '../src/core/QuestionDifficulty.js'
import { DuelRules } from '../src/core/DuelRules.js'
import { SurvivalRun } from '../src/core/SurvivalRun.js'
import { plainText } from '../src/core/plainText.js'
import { Elo } from '../src/core/Elo.js'

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


const persisted = []
const tracker = new ProgressTracker({ lectures: { '01-001': 1 }, settings: { lang: 'en' } }, (s) => persisted.push(s))
const backup = JSON.parse(JSON.stringify(tracker.exportData()))
const other = new ProgressTracker({ lectures: { '09-009': 2 } }, (s) => persisted.push(s))
await other.importData(backup)
assert.deepEqual(other.state.lectures, { '01-001': 1 }, 'import replaces progress')
assert.equal(other.state.settings.theme, 'system', 'missing settings fall back to defaults')
assert.equal(persisted.length, 1, 'imported progress is persisted right away')
assert.throws(() => other.importData({ lectures: {} }), /notBackup/, 'a random JSON file is refused')
assert.throws(() => other.importData({ ...backup, state: { ...backup.state, lectures: [] } }), /notBackup/)
assert.deepEqual(other.state.lectures, { '01-001': 1 }, 'a refused file changes nothing')

const long = { question: { en: `<p>${'x'.repeat(700)}</p>` }, answer: [0] }
assert.equal(QuestionDifficulty.of({ question: { en: 'short' } }, { kind: 'section' }), 'easy')
assert.equal(QuestionDifficulty.of({ question: { en: 'short' } }, { kind: 'exam' }), 'medium')
assert.equal(QuestionDifficulty.of({ ...long }, { kind: 'exam' }), 'hard', 'long scenario')
assert.equal(QuestionDifficulty.of({ question: { en: 'short' }, multi: true }, { kind: 'exam' }), 'hard', 'multi-select')

const fast = (action, level, correct = true, target = null) => ({ action, level, correct, answeredMs: 0, target })
const duo = (a = {}, b = {}) => [{ id: 1, team: 'A', hp: 100, guarded: false, buffed: false, ...a }, { id: 2, team: 'B', hp: 100, guarded: false, buffed: false, ...b }]
const hitOn = (out, to) => out.hits.find((h) => h.to === to && h.from !== to)
let out = DuelRules.resolveRound(duo(), { 1: fast('attack', 'hard') })
assert.deepEqual([hitOn(out, 2).damage, out.hp[2]], [24, 76], 'instant hard attack: full power')
out = DuelRules.resolveRound(duo({}, { guarded: true }), { 1: fast('attack', 'hard') })
assert.deepEqual([hitOn(out, 2).damage, hitOn(out, 2).kind], [5, 'blocked'], 'a guard stops 80% of an attack')
out = DuelRules.resolveRound(duo({}, { guarded: true }), { 1: fast('break', 'hard') })
assert.deepEqual([hitOn(out, 2).damage, hitOn(out, 2).kind], [9, 'pierced'], 'a guard stops 40% of a break (24 x 0.6 x 0.6)')
assert.ok(DuelRules.resolveRound(duo(), { 1: fast('break', 'medium') }).hp[2] > DuelRules.resolveRound(duo(), { 1: fast('attack', 'medium') }).hp[2], 'break is weaker than attack')
out = DuelRules.resolveRound(duo({ buffed: true }), { 1: fast('attack', 'hard') })
assert.equal(hitOn(out, 2).damage, 36, 'a buff makes the next attack 1.5x')
out = DuelRules.resolveRound(duo(), { 1: fast('attack', 'hard'), 2: fast('defend', 'easy') })
assert.deepEqual([out.hp[2], out.next[2].guarded], [76, true], 'defend protects next round, not this one')
out = DuelRules.resolveRound(duo(), { 1: fast('buff', 'easy'), 2: fast('break', 'easy') })
assert.deepEqual([out.next[1].buffed, out.hits.find((h) => h.from === 1).kind], [false, 'interrupted'], 'break interrupts a buff')
out = DuelRules.resolveRound(duo(), { 1: fast('defend', 'hard', false), 2: fast('attack', 'hard', false) })
assert.deepEqual([out.next[1].guarded, out.hp[1], hitOn(out, 1).kind], [false, 100, 'miss'], 'wrong answers do nothing')
const slow = { action: 'attack', level: 'easy', correct: true, answeredMs: (DuelRules.CHOOSE_SECONDS + DuelRules.ANSWER_SECONDS.easy) * 1000 }
assert.equal(DuelRules.resolveRound(duo(), { 1: slow }).hp[2], 100 - Math.round(10 * DuelRules.MIN_SPEED), 'the slower, the weaker')
assert.ok(DuelRules.ANSWER_SECONDS.easy < DuelRules.ANSWER_SECONDS.hard, 'hard questions get more time')
// 2v2: targets, support on a teammate, knockouts
const squad = [
  { id: 1, team: 'A', hp: 100 }, { id: 2, team: 'A', hp: 10 },
  { id: 3, team: 'B', hp: 100 }, { id: 4, team: 'B', hp: 100 },
].map((f) => ({ guarded: false, buffed: false, ...f }))
out = DuelRules.resolveRound(squad, { 1: fast('buff', 'easy', true, 2), 3: fast('attack', 'hard', true, 2), 4: fast('attack', 'easy', true, 99) })
assert.deepEqual([out.next[2].buffed, out.hp[2], out.next[2].guarded], [false, 0, false], 'a knocked-out fighter keeps no buff')
assert.equal(out.hits.find((h) => h.from === 4).to, 1, 'an invalid target falls back to a standing enemy')
out = DuelRules.resolveRound(squad, { 2: fast('defend', 'easy', true, 1), 3: fast('attack', 'easy', true, 3) })
assert.deepEqual([out.next[1].guarded, out.hits.find((h) => h.from === 3).to], [true, 1], 'guard a teammate; attacks never hit your own team')
assert.equal(DuelRules.winner(squad, 3), undefined)
assert.equal(DuelRules.winner(squad.map((f) => (f.team === 'B' ? { ...f, hp: 0 } : f)), 3), 'A', 'a wiped team loses')
assert.equal(DuelRules.winner(squad, 0), 'B', 'no rounds left: higher team HP wins')

const qs = [0, 1, 2, 3].map((id) => ({ id, multi: false, options: ['x', 'y'], answer: [0] }))
const survival = new SurvivalRun({ questions: qs, level: 'medium' })
survival.choose(0)
assert.equal(survival.check(), true)
assert.equal(survival.check(), null, 'scored once')
survival.next()
survival.choose(0)
survival.check()
assert.deepEqual([survival.streak, survival.score, survival.lives], [2, 20 + 22, 3], 'streak bonus grows')
survival.next()
survival.choose(1)
assert.equal(survival.check(), false)
assert.deepEqual([survival.streak, survival.bestStreak, survival.lives], [0, 2, 2], 'a miss costs a life and the streak')
const hc = new SurvivalRun({ questions: qs, level: 'easy', hardcore: true })
hc.choose(1)
hc.check()
assert.ok(hc.isOver, 'hardcore: one life')
assert.equal(hc.boardMode, 'easy-hardcore')

// shared helpers
assert.equal(plainText('<p>a  <b>b</b></p>	 c'), 'a b c')
assert.equal(DuelRules.outcomeFor(null, 'A'), 'draw')
assert.equal(DuelRules.outcomeFor('B', 'A'), 'loss')
assert.deepEqual(SurvivalRun.MODES, ['easy', 'easy-hardcore', 'medium', 'medium-hardcore', 'hard', 'hard-hardcore'])
assert.equal(StudyPlanner.toMs('1970-01-02'), 86_400_000)
const vi = new Localizer('vi', { vi: {}, en: {} })
assert.equal(vi.date(0, { year: 'numeric', timeZone: 'UTC' }), '1970')
assert.equal(vi.formats.size, 1, 'formatter cached per option set')
const judged = new QuizSession({ id: 'r', questions: [{ id: 1, options: ['a', 'b'], answer: [0], domain: 'D' }, { id: 2, options: ['a', 'b'], answer: [1] }] })
judged.choose(0)
judged.goTo(1)
judged.choose(0)
assert.deepEqual(judged.result(), { correct: 1, total: 2, percent: 50, passed: false, rightIds: [1], wrongIds: [2], byDomain: { D: { correct: 1, total: 1 } } })

// Elo
const even = Elo.update({ A: [{ id: 1, rating: 1000 }], B: [{ id: 2, rating: 1000 }] }, 'A')
assert.deepEqual([even[1].delta, even[2].delta, even[1].after], [16, -16, 1016], 'even match: K/2 each way')
const upset = Elo.update({ A: [{ id: 1, rating: 1000 }], B: [{ id: 2, rating: 1400 }] }, 'A')
assert.equal(upset[1].delta, 29, 'beating a much stronger player pays more')
assert.equal(Elo.update({ A: [{ id: 1, rating: 1400 }], B: [{ id: 2, rating: 1000 }] }, 'A')[1].delta, 3, 'beating a weaker one pays little')
assert.equal(Elo.update({ A: [{ id: 1, rating: 1000 }], B: [{ id: 2, rating: 1000 }] }, null)[1].delta, 0, 'an even draw changes nothing')
const pair = Elo.update({ A: [{ id: 1, rating: 1100 }, { id: 2, rating: 900 }], B: [{ id: 3, rating: 1000 }, { id: 4, rating: 1000 }] }, 'B')
assert.deepEqual([pair[1].delta, pair[2].delta, pair[3].delta], [-16, -16, 16], 'teams play at their average; members move together')

console.log('selfcheck OK')
