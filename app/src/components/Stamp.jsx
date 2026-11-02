import { useApp } from '../state/AppContext'

/** Rubber-stamp verdict pressed onto an answered card; it stays, it never disappears. */
export function Stamp({ correct }) {
  const { l } = useApp()
  return (
    <span className={`stamp ${correct ? 'stamp--ok' : 'stamp--bad'}`} role="status">
      {l.ui(correct ? 'quiz.correct' : 'quiz.incorrect')}
    </span>
  )
}
