import { Star } from 'lucide-react'
import { useApp } from '../state/AppContext'

/** Toggles a lecture's star; sits beside a LectureRow, never inside its link. */
export function StarButton({ lectureId }) {
  const { tracker, l } = useApp()
  const on = tracker.isStarred(lectureId)
  const label = l.ui(on ? 'plan.unstar' : 'plan.star')
  return (
    <button type="button" className="icon-btn star-btn" aria-pressed={on} aria-label={label} title={label} onClick={() => tracker.toggleStar(lectureId)}>
      <Star size={16} aria-hidden="true" fill={on ? 'currentColor' : 'none'} />
    </button>
  )
}
