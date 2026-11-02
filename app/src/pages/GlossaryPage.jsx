import { useDeferredValue, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { SectionTab } from '../components/SectionTab'
import { TermList } from '../components/TermList'

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

export function GlossaryPage() {
  const { repo, l } = useApp()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  // Matches term and both definitions, accent-insensitive, so "hoc may" finds "học máy".
  const groups = useMemo(() => {
    const needle = fold(deferred.trim())
    const hits = repo.terms.filter((t) => !needle || fold(`${t.term} ${t.definition.en} ${t.definition.vi}`).includes(needle))
    return repo.studySections.map((s) => ({ section: s, terms: hits.filter((t) => t.section === s.id) })).filter((g) => g.terms.length)
  }, [repo, deferred])
  const count = groups.reduce((n, g) => n + g.terms.length, 0)

  return (
    <div className="page">
      <PageHeader
        title={l.ui('nav.glossary')}
        lead={l.ui('glossary.lead', { n: repo.terms.length })}
        aside={
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{l.ui('glossary.search')}</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={l.ui('glossary.search')} />
          </label>
        }
      />
      {query && <p className="muted small" role="status">{l.ui('glossary.results', { n: count })}</p>}
      {groups.length === 0 && <p className="empty card-stock">{l.ui('glossary.none')}</p>}
      {groups.map(({ section, terms }) => (
        <section key={section.id} className="glossary-group" aria-labelledby={`g-${section.id}`}>
          <h2 id={`g-${section.id}`} className="title-with-tab">
            <SectionTab id={section.id} /> <BiText pair={section.title} />
          </h2>
          <TermList terms={terms} />
        </section>
      ))}
    </div>
  )
}
