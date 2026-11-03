/** Best score badge: green when it passes, red when it does not, a dash when never taken. */
export function Score({ best, pass }) {
  const tone = best == null ? '' : best >= pass ? 'score--pass' : 'score--fail'
  return <span className={`score ${tone}`}>{best == null ? '-' : `${best}%`}</span>
}
