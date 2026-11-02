import { Link } from 'react-router-dom'
import { RotateCcw, Timer } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { SectionTab } from '../components/SectionTab'

function QuizRow({ quiz }) {
  const { tracker, l } = useApp()
  const stats = tracker.quizStats(quiz.id)
  const passed = stats && stats.best >= quiz.passPercent
  const run = tracker.quizRun(quiz.id)
  return (
    <li className="quiz-row">
      <SectionTab id={quiz.section ?? 'exam'} size="sm" />
      <Link to={`/quiz/${quiz.id}`} className="quiz-row__title">
        <BiText pair={quiz.title} />
        <small className="muted">
          {l.ui('quiz.questionsN', { n: quiz.questions.length })}
          {run && <span className="quiz-row__run"> · {l.ui('quiz.inProgress', { n: Object.keys(run.selections).length, total: quiz.questions.length })}</span>}
        </small>
      </Link>
      <span className={`score ${stats ? (passed ? 'score--pass' : 'score--fail') : ''}`}>{stats ? `${stats.best}%` : '-'}</span>
      <span className="quiz-row__actions">
        <Link to={`/quiz/${quiz.id}?mode=practice`} className="btn btn--sm">{l.ui('quiz.practice')}</Link>
        <Link to={`/quiz/${quiz.id}?mode=exam`} className="btn btn--sm"><Timer size={14} aria-hidden="true" /> {l.ui('quiz.exam')}</Link>
      </span>
    </li>
  )
}

export function QuizzesPage() {
  const { repo, tracker, l } = useApp()
  const groups = [
    ['quizzes.exams', repo.quizzes.filter((q) => q.kind === 'exam')],
    ['quizzes.sections', repo.quizzes.filter((q) => q.kind === 'section')],
  ]
  const mistakes = tracker.mistakeIds.length
  return (
    <div className="page">
      <PageHeader
        title={l.ui('nav.quizzes')}
        lead={l.ui('quizzes.lead', { n: repo.questionIndex.size })}
        aside={
          <Link to="/quiz/mistakes" className={`btn ${mistakes ? 'btn--primary' : ''}`}>
            <RotateCcw size={16} aria-hidden="true" /> {l.ui('dash.mistakes', { n: mistakes })}
          </Link>
        }
      />
      {groups.map(([key, quizzes]) => (
        <section key={key} className="panel" aria-labelledby={key}>
          <h2 id={key}>{l.ui(key)}</h2>
          <ul className="quiz-list">{quizzes.map((q) => <QuizRow key={q.id} quiz={q} />)}</ul>
        </section>
      ))}
    </div>
  )
}
