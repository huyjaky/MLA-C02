import { Link, useParams } from 'react-router-dom'
import { Check, FileText, Layers, ListChecks, PlayCircle } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { SectionTab } from '../components/SectionTab'
import { Meter } from '../components/Meter'
import { TermList } from '../components/TermList'
import { NotFoundPage } from './NotFoundPage'

export function SectionPage() {
  const { id } = useParams()
  const { repo, tracker, l } = useApp()
  const section = repo.section(id)
  if (!section) return <NotFoundPage />
  const progress = tracker.sectionProgress(section)
  const terms = repo.termsFor(id)

  return (
    <div className="page">
      <PageHeader
        title={<span className="title-with-tab"><SectionTab id={id} size="lg" /><BiText pair={section.title} /></span>}
        lead={l.ui('section.lead', { done: progress.done, total: progress.total, terms: terms.length })}
        aside={
          <div className="actions">
            {repo.quizzesFor(id).map((q) => (
              <Link key={q.id} to={`/quiz/${q.id}`} className="btn btn--primary">
                <ListChecks size={16} aria-hidden="true" /> {l.ui('section.takeQuiz')}
              </Link>
            ))}
            {terms.length > 0 && (
              <Link to={`/flashcards?section=${id}`} className="btn">
                <Layers size={16} aria-hidden="true" /> {l.ui('nav.flashcards')}
              </Link>
            )}
          </div>
        }
      >
        <Meter value={progress.ratio} label={l.ui('dash.colLectures')} />
      </PageHeader>

      <div className="section-grid">
        <section aria-labelledby="lectures-h">
          <h2 id="lectures-h">{l.ui('section.lectures')}</h2>
          <ol className="lecture-list">
            {section.lectures.map((lecture) => {
              const done = tracker.isLectureDone(lecture.id)
              const Icon = lecture.kind === 'note' ? FileText : PlayCircle
              return (
                <li key={lecture.id}>
                  <Link to={`/lecture/${lecture.id}`} className="lecture-row" data-done={done}>
                    <span className="lecture-row__num num">{lecture.id.slice(3)}</span>
                    <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="lecture-row__icon" />
                    <span className="lecture-row__title"><BiText pair={lecture.title} /></span>
                    {done ? (
                      <Check size={16} className="lecture-row__done" aria-label={l.ui('lecture.done')} />
                    ) : (
                      tracker.watchRatio(lecture.id) > 0 && <Meter value={tracker.watchRatio(lecture.id)} label={l.ui('lecture.watched')} />
                    )}
                  </Link>
                </li>
              )
            })}
          </ol>
        </section>

        {terms.length > 0 && (
          <section aria-labelledby="terms-h">
            <h2 id="terms-h">{l.ui('section.keyTerms')}</h2>
            <TermList terms={terms} />
          </section>
        )}
      </div>
    </div>
  )
}
