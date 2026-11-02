import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { SectionTab } from '../components/SectionTab'

/** Instructor notes from the course's .html lectures: updates, renames and cost warnings. */
export function NotesPage() {
  const { repo, l } = useApp()
  return (
    <div className="page page--narrow">
      <PageHeader title={l.ui('nav.notes')} lead={l.ui('notes.lead', { n: repo.notes.length })} />
      <div className="notes">
        {repo.notes.map((note) => (
          <article key={note.id} className="note card-stock" aria-labelledby={`n-${note.id}`}>
            <header className="note__head">
              <SectionTab id={note.section} size="sm" />
              <h2 id={`n-${note.id}`}><BiText pair={note.title} /></h2>
              <Link to={`/section/${note.section}`} className="note__section muted small">
                <BiText pair={repo.section(note.section).title} />
              </Link>
            </header>
            <BiText pair={note.body} html className="prose" />
          </article>
        ))}
      </div>
    </div>
  )
}
