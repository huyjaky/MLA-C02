import { useEffect } from 'react'
import { Timer } from 'lucide-react'
import { Localizer } from '../../core/Localizer'
import { useTicker } from '../../state/hooks'

/** Countdown that re-renders only itself each second and fires onExpire once at zero. */
export function ExamTimer({ session, onExpire }) {
  useTicker(1000, !session.submitted)
  const left = session.secondsLeft()

  useEffect(() => {
    if (!session.submitted && left <= 0) onExpire()
  })

  return (
    <p className="timer num" data-low={left < 300} role="timer">
      <Timer size={16} aria-hidden="true" /> {Localizer.clock(left)}
    </p>
  )
}
