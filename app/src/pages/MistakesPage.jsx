import { Link } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { MistakeHelp } from '../components/quiz/MistakeHelp'

/** The review room: every missed question by source exam, with the lectures to rewatch and the exam's advice. */
export function MistakesPage() {
  const { repo, tracker, l } = useApp()
  const questions = repo.questionsByIds(tracker.mistakeIds)
  const groups = repo.quizzes
    .map((quiz) => ({ quiz, items: questions.filter((q) => repo.questionIndex.get(q.id).quiz === quiz) }))
    .filter((g) => g.items.length)

  return (
    <div className="page">
      <PageHeader
        title={l.ui('mistakes.title')}
        lead={l.ui(questions.length ? 'mistakes.lead' : 'quiz.noMistakes', { n: questions.length })}
        aside={
          questions.length > 0 && (
            <Link to="/quiz/mistakes?mode=practice" className="btn btn--primary btn--lg">
              <Dumbbell size={18} aria-hidden="true" /> {l.ui('mistakes.practice')}
            </Link>
          )
        }
      />
      {groups.map(({ quiz, items }) => (
        <section key={quiz.id} className="panel">
          <h2><BiText pair={quiz.title} /> <span className="muted small num">({items.length})</span></h2>
          <ul className="mistake-list">
            {items.map((q) => (
              <li key={q.id} className="mistake">
                <BiText pair={q.question} html className="mistake__question" />
                <MistakeHelp question={q} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
