/** Thin labelled progress bar. `value` is 0..1. */
export function Meter({ value, label, tone = 'ink' }) {
  const pct = Math.round(value * 100)
  return (
    <span className={`meter meter--${tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <span className="meter__fill" style={{ '--value': value }} />
    </span>
  )
}
