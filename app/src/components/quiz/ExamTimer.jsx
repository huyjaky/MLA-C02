import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { Localizer } from '../../core/Localizer'

/** Countdown that re-renders only itself each second and fires onExpire once at zero. */
export function ExamTimer({ session, onExpire }) {
  const [, tick] = useState(0)
  const left = session.secondsLeft()

  useEffect(() => {
    if (session.submitted) return
    if (left <= 0) return onExpire()
    const t = setTimeout(() => tick((n) => n + 1), 1000)
    return () => clearTimeout(t)
  })

  return (
    <p className="timer num" data-low={left < 300} role="timer">
      <Timer size={16} aria-hidden="true" /> {Localizer.clock(left)}
    </p>
  )
}
