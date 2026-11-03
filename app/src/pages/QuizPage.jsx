import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCheck, Play, RotateCcw } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { useHotkeys, useMutable } from '../state/hooks'
import { QuizSession } from '../core/QuizSession'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { Segmented } from '../components/Segmented'
import { Meter } from '../components/Meter'
import { QuestionCard } from '../components/quiz/QuestionCard'
import { AnswerSheet } from '../components/quiz/AnswerSheet'
import { ExamTimer } from '../components/quiz/ExamTimer'
import { MistakeHelp } from '../components/quiz/MistakeHelp'
import { NotFoundPage } from './NotFoundPage'

/** Real quizzes come from content; "mistakes" is built from every question answered wrong. */
function useQuiz(id) {
  const { repo, tracker, l } = useApp()
  // Captured once per visit, so answering does not reshuffle the review list mid-run.
  return useMemo(() => {
    if (id !== 'mistakes') return repo.quiz(id)
    const title = { en: l.ui('quiz.mistakes'), vi: l.ui('quiz.mistakes') }
    return { id, kind: 'review', title, passPercent: 70, questions: repo.questionsByIds(tracker.mistakeIds) }
  }, [id, repo]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function QuizPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const quiz = useQuiz(id)
  const { tracker } = useApp()
  const [run, setRun] = useState(null) // { mode, key, saved? } while a session is active

  if (!quiz) return <NotFoundPage />
  if (!quiz.questions.length) return <EmptyQuiz />
  if (!run) {
    const mode = params.get('mode') ?? 'practice'
    const start = (m) => {
      tracker.clearQuizRun(quiz.id) // starting over discards the unfinished attempt
      setRun({ mode: m, key: Date.now() })
    }
    const resume = (saved) => setRun({ mode: saved.mode, key: Date.now(), saved })
    // keyed so a new ?mode= (e.g. Practice vs Exam links) resets the intro's selection
    return <QuizIntro key={`${quiz.id}-${mode}`} quiz={quiz} initialMode={mode} onStart={start} onResume={resume} />
  }
  return <QuizRun key={run.key} quiz={quiz} mode={run.mode} saved={run.saved} onRestart={() => setRun(null)} />
}

function EmptyQuiz() {
  const { l } = useApp()
  return (
    <div className="page">
      <PageHeader title={l.ui('quiz.mistakes')} lead={l.ui('quiz.noMistakes')}>
        <Link to="/quizzes" className="btn btn--primary">{l.ui('nav.quizzes')}</Link>
      </PageHeader>
    </div>
  )
}

function QuizIntro({ quiz, initialMode, onStart, onResume }) {
  const { tracker, l } = useApp()
  const [mode, setMode] = useState(initialMode)
  const stats = tracker.quizStats(quiz.id)
  const saved = tracker.quizRun(quiz.id)
  const minutes = (quiz.questions.length * QuizSession.SECONDS_PER_QUESTION) / 60
  return (
    <div className="page page--narrow">
      <PageHeader title={<BiText pair={quiz.title} />} lead={l.ui('quiz.introLead', { n: quiz.questions.length, pass: quiz.passPercent })}>
        {stats && <p className="muted">{l.ui('quiz.bestAttempts', { best: stats.best, n: stats.attempts.length })}</p>}
      </PageHeader>
      {saved && (
        <div className="resume-run card-stock">
          <div>
            <strong>{l.ui('quiz.resumeTitle')}</strong>
            <p className="muted small">
              {l.ui('quiz.resumeInfo', {
                n: saved.index + 1,
                total: quiz.questions.length,
                answered: Object.keys(saved.selections).length,
                mode: l.ui(saved.mode === 'exam' ? 'quiz.exam' : 'quiz.practice'),
                time: l.date(saved.savedAt, { dateStyle: 'short', timeStyle: 'short' }),
              })}
            </p>
          </div>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => onResume(saved)} autoFocus>
            <Play size={18} aria-hidden="true" /> {l.ui('quiz.resume')}
          </button>
        </div>
      )}
      <div className="intro card-stock">
        <Segmented
          label={l.ui('quiz.mode')}
          value={mode}
          onChange={setMode}
          options={[{ value: 'practice', label: l.ui('quiz.practice') }, { value: 'exam', label: l.ui('quiz.exam') }]}
        />
        <p className="intro__help">{mode === 'exam' ? l.ui('quiz.examHelp', { min: minutes }) : l.ui('quiz.practiceHelp')}</p>
        <button type="button" className={`btn btn--lg ${saved ? '' : 'btn--primary'}`} onClick={() => onStart(mode)} autoFocus={!saved}>
          {l.ui(saved ? 'quiz.startOver' : 'quiz.start')} <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function QuizRun({ quiz, mode, saved, onRestart }) {
  const { tracker, l } = useApp()
  const [session, commitOnly] = useMutable(() => {
    const options = { id: quiz.id, questions: quiz.questions, mode, passPercent: quiz.passPercent }
    return saved ? QuizSession.restore(options, saved) : new QuizSession(options)
  })
  // Save the attempt after every answer, move and flag (and when leaving), so it can be resumed later.
  const persist = () => {
    if (!session.submitted && (session.answeredCount || session.flagged.size)) tracker.saveQuizRun(quiz.id, session.snapshot())
  }
  const commit = (fn) => {
    const result = commitOnly(fn)
    persist()
    return result
  }
  useEffect(() => persist, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [result, setResult] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const q = session.current
  const revealed = session.isRevealed(q)
  const isLast = session.index === session.questions.length - 1

  const finish = () => {
    if (session.submitted) return
    const r = commitOnly((s) => s.submit())
    tracker.recordQuiz(quiz.id, mode, r)
    tracker.clearQuizRun(quiz.id)
    setResult(r)
  }
  // Practice: first press checks the answer, second moves on. Exam: always moves on.
  const advance = () => {
    if (!session.isExam && !revealed && session.selectionOf(q).size) commit((s) => s.check())
    else if (!isLast) commit((s) => s.goTo(s.index + 1))
  }

  useHotkeys((e) => {
    const n = Number(e.key)
    if (n >= 1 && n <= q.options.length) commit((s) => s.choose(n - 1))
    else if (e.key === 'ArrowRight') commit((s) => s.goTo(s.index + 1))
    else if (e.key === 'ArrowLeft') commit((s) => s.goTo(s.index - 1))
    else if (e.key === 'Enter' && !e.target.closest('button, a')) advance()
    else if (e.key.toLowerCase() === 'f') commit((s) => s.toggleFlag())
    else return false
    return true
  })

  if (result && !reviewing) {
    const review = () => {
      commit((s) => s.goTo(0))
      setReviewing(true)
    }
    return <QuizResult quiz={quiz} result={result} onReview={review} onRestart={onRestart} />
  }

  return (
    <div className="page page--wide quiz">
      <div className="quiz__main">
        <h1 className="quiz__title"><BiText pair={quiz.title} /></h1>
        <QuestionCard
          key={q.id}
          session={session}
          onChoose={(i) => commit((s) => s.choose(i))}
          onFlag={() => commit((s) => s.toggleFlag())}
        />
        <div className="quiz__nav">
          <button type="button" className="btn" disabled={session.index === 0} onClick={() => commit((s) => s.goTo(s.index - 1))}>
            <ArrowLeft size={16} aria-hidden="true" /> {l.ui('quiz.prev')}
          </button>
          {!session.isExam && !revealed ? (
            <button type="button" className="btn btn--primary" disabled={!session.selectionOf(q).size} onClick={advance}>
              {l.ui('quiz.check')}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={isLast} onClick={advance}>
              {l.ui('quiz.next')} <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="muted small">{l.ui('quiz.keys')}</p>
      </div>

      <aside className="quiz__side" aria-label={l.ui('quiz.sheet')}>
        {session.isExam && !session.submitted && <ExamTimer session={session} onExpire={finish} />}
        <p className="small muted">{l.ui('quiz.answered', { n: session.answeredCount, total: session.questions.length })}</p>
        <AnswerSheet session={session} onJump={(i) => commit((s) => s.goTo(i))} />
        {session.submitted ? (
          <button type="button" className="btn" onClick={() => setReviewing(false)}>{l.ui('quiz.backToResult')}</button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={finish}>
            <CheckCheck size={16} aria-hidden="true" /> {l.ui('quiz.submit')}
          </button>
        )}
        {quiz.id === 'mistakes' && <MistakeHelp question={q} showAdvice={revealed} />}
      </aside>
    </div>
  )
}

function QuizResult({ quiz, result, onReview, onRestart }) {
  const { l } = useApp()
  const domains = Object.entries(result.byDomain)
  return (
    <div className="page page--narrow">
      <div className="result card-stock">
        <span className={`stamp stamp--big ${result.passed ? 'stamp--ok' : 'stamp--bad'}`}>
          {l.ui(result.passed ? 'quiz.passed' : 'quiz.failed')}
        </span>
        <h1><BiText pair={quiz.title} /></h1>
        <p className="result__score">
          <strong className="num">{result.percent}%</strong>
          {l.ui('quiz.resultLine', { correct: result.correct, total: result.total, pass: quiz.passPercent })}
        </p>
        {domains.length > 0 && (
          <table className="table">
            <caption>{l.ui('quiz.byDomain')}</caption>
            <tbody>
              {domains.map(([name, d]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td><Meter value={d.correct / d.total} label={name} tone={d.correct / d.total >= quiz.passPercent / 100 ? 'ok' : 'bad'} /></td>
                  <td className="num">{d.correct}/{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {result.wrongIds.length > 0 && <p className="muted">{l.ui('quiz.addedToMistakes', { n: result.wrongIds.length })}</p>}
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={onReview}>{l.ui('quiz.review')}</button>
          <button type="button" className="btn" onClick={onRestart}><RotateCcw size={16} aria-hidden="true" /> {l.ui('quiz.retake')}</button>
          <Link to="/quizzes" className="btn btn--ghost">{l.ui('nav.quizzes')}</Link>
        </div>
      </div>
    </div>
  )
}
