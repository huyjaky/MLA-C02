import { useApp } from '../state/AppContext'

/** The card box seen from above: one compartment per Leitner box with its card count. */
export function LeitnerBox({ counts, active = -1 }) {
  const { l } = useApp()
  return (
    <ol className="leitner" aria-label={l.ui('cards.box')}>
      {counts.map((count, box) => (
        <li key={box} className="leitner__slot" data-active={box === active} data-box={box}>
          <span className="leitner__count num">{count}</span>
          <span className="leitner__label">{box === 0 ? l.ui('cards.new') : l.ui('cards.boxN', { n: box })}</span>
        </li>
      ))}
    </ol>
  )
}
