import { Link } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { Meter } from '../components/Meter'
import { LectureRow } from '../components/LectureRow'
import { MistakeHelp } from '../components/quiz/MistakeHelp'
import { examDomain } from '../core/ExamDomain'

const WEAK_LECTURES = 8

/** The review room: where the mistakes cluster (domains, lectures), then every missed question by source exam. */
export function MistakesPage() {
  const { repo, tracker, l } = useApp()
  const questions = repo.questionsByIds(tracker.mistakeIds)
  const byQuiz = new Map()
  for (const q of questions) {
    const { quiz } = repo.questionIndex.get(q.id)
    if (!byQuiz.has(quiz)) byQuiz.set(quiz, [])
    byQuiz.get(quiz).push(q)
  }
  const groups = repo.quizzes.filter((quiz) => byQuiz.has(quiz)).map((quiz) => ({ quiz, items: byQuiz.get(quiz) }))

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
      {questions.length > 0 && <WeakSpots questions={questions} />}
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

/** Mistakes per exam domain (each drills just that domain) and the lectures most of them point back to. */
function WeakSpots({ questions }) {
  const { repo, l } = useApp()
  const domains = new Map()
  const lectures = new Map()
  for (const q of questions) {
    const d = examDomain(q.domain)
    domains.set(d, (domains.get(d) ?? 0) + 1)
    for (const id of repo.relatedLectures(q)) lectures.set(id, (lectures.get(id) ?? 0) + 1)
  }
  const byCount = (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))
  const domainRows = [...domains].sort(byCount)
  const lectureRows = [...lectures].sort(byCount).slice(0, WEAK_LECTURES)
  const most = domainRows[0][1]

  return (
    <div className="weak">
      <section className="weak__panel card-stock" aria-labelledby="weak-domains-h">
        <h2 id="weak-domains-h">{l.ui('mistakes.byDomain')}</h2>
        <ul className="weak__domains">
          {domainRows.map(([d, n]) => (
            <li key={d}>
              <span className="weak__name">{l.ui(`domain.${d}`)}</span>
              <span className="num small muted">{l.ui('mistakes.count', { n })}</span>
              <Link to={`/quiz/mistakes?mode=practice&domain=${d}`} className="btn btn--sm">
                <Dumbbell size={14} aria-hidden="true" /> {l.ui('mistakes.drill')}
              </Link>
              <Meter value={n / most} label={l.ui(`domain.${d}`)} tone="bad" />
            </li>
          ))}
        </ul>
      </section>
      <section className="weak__panel card-stock" aria-labelledby="weak-lectures-h">
        <h2 id="weak-lectures-h">{l.ui('mistakes.weakLectures')}</h2>
        {lectureRows.length ? (
          <ol className="weak__lectures">
            {lectureRows.map(([id, n]) => (
              <li key={id}>
                <LectureRow lecture={repo.lecture(id).lecture} num={id} />
                <span className="num small muted">{l.ui('mistakes.count', { n })}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted small">{l.ui('mistakes.noRelated')}</p>
        )}
      </section>
    </div>
  )
}
