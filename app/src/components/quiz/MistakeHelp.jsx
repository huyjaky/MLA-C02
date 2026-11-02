import { Link } from 'react-router-dom'
import { Lightbulb, PlayCircle } from 'lucide-react'
import { useApp } from '../../state/AppContext'
import { MistakeCoach } from '../../core/MistakeCoach'
import { BiText } from '../BiText'

/** Related lectures for a missed question, plus the exam's advice once `showAdvice` is true. */
export function MistakeHelp({ question, showAdvice = true }) {
  const { repo, l } = useApp()
  const lectures = repo.relatedLectures(question)
  const advice = showAdvice ? MistakeCoach.advice(question) : null
  return (
    <div className="mistake-help">
      <h3>{l.ui('mistakes.related')}</h3>
      {lectures.length ? (
        <ul>
          {lectures.map((id) => (
            <li key={id}>
              <Link to={`/lecture/${id}`} target="_blank" rel="noreferrer">
                <PlayCircle size={14} aria-hidden="true" /> <BiText pair={repo.lecture(id).lecture.title} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{l.ui('mistakes.noRelated')}</p>
      )}
      {advice && (
        <>
          <h3><Lightbulb size={14} aria-hidden="true" /> {l.ui('mistakes.advice')}</h3>
          <BiText pair={advice} as="p" className="small" />
        </>
      )}
    </div>
  )
}
