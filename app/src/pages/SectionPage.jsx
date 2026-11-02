import { Link, useParams } from 'react-router-dom'
import { Layers, ListChecks } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { SectionTab } from '../components/SectionTab'
import { Meter } from '../components/Meter'
import { TermList } from '../components/TermList'
import { LectureRow } from '../components/LectureRow'
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
            {section.lectures.map((lecture) => (
              <li key={lecture.id}><LectureRow lecture={lecture} /></li>
            ))}
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
