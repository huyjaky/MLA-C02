import { Link } from 'react-router-dom'
import { Check, FileText, PlayCircle } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { BiText } from './BiText'
import { Meter } from './Meter'

/** One lecture in a list: number, title, and a done tick or how much was watched. */
export function LectureRow({ lecture, num = lecture.id.slice(3) }) {
  const { tracker, l } = useApp()
  const done = tracker.isLectureDone(lecture.id)
  const watched = tracker.watchRatio(lecture.id)
  const Icon = lecture.kind === 'note' ? FileText : PlayCircle
  return (
    <Link to={`/lecture/${lecture.id}`} className="lecture-row" data-done={done}>
      <span className="lecture-row__num num">{num}</span>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="lecture-row__icon" />
      <span className="lecture-row__title"><BiText pair={lecture.title} /></span>
      {done ? (
        <Check size={16} className="lecture-row__done" aria-label={l.ui('lecture.done')} />
      ) : (
        watched > 0 && <Meter value={watched} label={l.ui('lecture.watched')} />
      )}
    </Link>
  )
}
