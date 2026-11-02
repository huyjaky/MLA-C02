import { Link } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { BiText } from './BiText'

/** Glossary entries as index cards, each linking back to the lecture that teaches it. */
export function TermList({ terms }) {
  const { l } = useApp()
  return (
    <dl className="term-list">
      {terms.map((t) => (
        <div key={`${t.section}:${t.id}`} className="term card-stock">
          <dt>{t.term}</dt>
          <dd>
            <BiText pair={t.definition} as="p" />
            {t.lecture && (
              <Link to={`/lecture/${t.lecture}`} className="term__source">
                <PlayCircle size={14} aria-hidden="true" /> {l.ui('glossary.watch')}
              </Link>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
