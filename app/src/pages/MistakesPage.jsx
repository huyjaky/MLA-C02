import { Link } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { DomainDonut } from '../components/DomainDonut'
import { LectureRow } from '../components/LectureRow'
import { MistakeHelp } from '../components/quiz/MistakeHelp'
import { examDomain } from '../core/ExamDomain'

const WEAK_LECTURES = 8
const domainColor = (d) => (d ? `var(--tab-${d})` : 'var(--ink-3)')
const sectionId = (d) => `domain-${d}`

/** The review room: a donut of where the mistakes cluster, then every missed question grouped by exam domain. */
export function MistakesPage() {
  const { repo, tracker, l } = useApp()
  const questions = repo.questionsByIds(tracker.mistakeIds)
  const byDomain = new Map()
  for (const q of questions) {
    const d = examDomain(q.domain)
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d).push(q)
  }
  // most mistakes first; untagged section-quiz questions last
  const groups = [...byDomain].sort((a, b) => !a[0] - !b[0] || b[1].length - a[1].length).map(([d, items]) => ({ d, items }))

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
      {questions.length > 0 && <WeakSpots questions={questions} groups={groups} />}
      {groups.map(({ d, items }) => (
        <section key={d} id={sectionId(d)} className="panel mistake-domain">
          <div className="mistake-domain__head">
            <h2>
              <span className="donut__swatch" style={{ background: domainColor(d) }} aria-hidden="true" />
              {l.ui(`domain.${d}`)} <span className="muted small num">({items.length})</span>
            </h2>
            <Link to={`/quiz/mistakes?mode=practice&domain=${d}`} className="btn btn--sm">
              <Dumbbell size={14} aria-hidden="true" /> {l.ui('mistakes.drill')}
            </Link>
          </div>
          <ul className="mistake-list">
            {items.map((q) => (
              <li key={q.id} className="mistake">
                <div>
                  <p className="muted small mistake__source"><BiText pair={repo.questionIndex.get(q.id).quiz.title} /></p>
                  <BiText pair={q.question} html className="mistake__question" />
                </div>
                <MistakeHelp question={q} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** The donut (hover names a domain, click jumps to its questions) and the lectures most mistakes point back to. */
function WeakSpots({ questions, groups }) {
  const { repo, l } = useApp()
  const lectures = new Map()
  for (const q of questions) for (const id of repo.relatedLectures(q)) lectures.set(id, (lectures.get(id) ?? 0) + 1)
  const lectureRows = [...lectures].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, WEAK_LECTURES)
  const jump = (d) => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(sectionId(d))?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  return (
    <div className="weak">
      <section className="weak__panel card-stock" aria-labelledby="weak-domains-h">
        <h2 id="weak-domains-h">{l.ui('mistakes.byDomain')}</h2>
        <DomainDonut
          slices={groups.map(({ d, items }) => ({ key: d, label: l.ui(`domain.${d}`), value: items.length, color: domainColor(d) }))}
          totalLabel={l.ui('mistakes.total')}
          onPick={jump}
        />
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
