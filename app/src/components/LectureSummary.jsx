import { useState } from 'react'
import { ChevronDown, Lightbulb, NotebookText } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { useAsync } from '../state/hooks'
import { BiText } from './BiText'
import { MermaidDiagram } from './MermaidDiagram'

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

/**
 * Collapsed bar under the video; opening it shows the lecture summary written from the transcript:
 * TL;DR, key points, services and what they are for, a fun fact and a Mermaid diagram.
 */
export function LectureSummary({ lectureId }) {
  const { repo, state, l } = useApp()
  const summary = useAsync(() => repo.summary(lectureId), [repo, lectureId])
  const [open, setOpen] = useState(false)

  if (!summary) return null
  const { theme } = state.settings
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())

  return (
    <details className="lesson-summary card-stock" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="lesson-summary__bar">
        <NotebookText size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className="lesson-summary__label">
          <strong>{l.ui('summary.title')}</strong>
          <small>{l.ui('summary.hint')}</small>
        </span>
        <ChevronDown size={18} className="lesson-summary__chevron" aria-hidden="true" />
      </summary>

      {open && (
        <div className="lesson-summary__body">
          <BiText pair={summary.tldr} as="p" className="lesson-summary__tldr" />

          <section className="lesson-summary__block">
            <h3>{l.ui('summary.points')}</h3>
            <ul className="lesson-summary__points">
              {summary.points.map((point, i) => (
                <li key={i}>
                  <BiText pair={point} />
                </li>
              ))}
            </ul>
          </section>

          {summary.services?.length > 0 && (
            <section className="lesson-summary__block">
              <h3>{l.ui('summary.services')}</h3>
              <dl className="lesson-summary__services">
                {summary.services.map((service) => (
                  <div key={service.name}>
                    <dt>{service.name}</dt>
                    <dd>
                      <BiText pair={service.use} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {summary.funFact && (
            <aside className="lesson-summary__fact">
              <h3>
                <Lightbulb size={16} aria-hidden="true" /> {l.ui('summary.funFact')}
              </h3>
              <BiText pair={summary.funFact} as="p" />
            </aside>
          )}

          {summary.diagram && (
            <section className="lesson-summary__block">
              <h3>{l.ui('summary.diagram')}</h3>
              <MermaidDiagram code={l.text(summary.diagram)} dark={dark} label={l.text(summary.tldr)} />
            </section>
          )}
        </div>
      )}
    </details>
  )
}
