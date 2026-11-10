import { useState } from 'react'

const R = 54
const C = 2 * Math.PI * R
const GAP = 3 // px of track left between slices

/**
 * Donut of `slices` [{ key, label, value, color }]. Hovering a slice or its legend row names it in the middle;
 * clicking either calls onPick(key). The legend holds the buttons, so keyboard and screen readers use it too.
 */
export function DomainDonut({ slices, totalLabel, onPick }) {
  const [hover, setHover] = useState(null)
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const shown = slices.find((s) => s.key === hover)
  let start = 0
  const arcs = slices.map((s) => {
    const length = (s.value / total) * C
    const arc = { ...s, dash: Math.max(length - (slices.length > 1 ? GAP : 0), 1), offset: -start }
    start += length
    return arc
  })

  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" className="donut__chart" aria-hidden="true">
        <g transform="rotate(-90 70 70)">
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="70"
              cy="70"
              r={R}
              className="donut__slice"
              data-dim={hover !== null && hover !== a.key}
              stroke={a.color}
              strokeDasharray={`${a.dash} ${C}`}
              strokeDashoffset={a.offset}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick(a.key)}
            >
              <title>{`${a.label}: ${a.value}`}</title>
            </circle>
          ))}
        </g>
        <text x="70" y="66" className="donut__value">{shown ? shown.value : total}</text>
        <text x="70" y="84" className="donut__caption">{shown ? `${Math.round((shown.value / total) * 100)}%` : totalLabel}</text>
      </svg>
      <ul className="donut__legend">
        {slices.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className="donut__item"
              data-active={hover === s.key}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s.key)}
              onBlur={() => setHover(null)}
              onClick={() => onPick(s.key)}
            >
              <span className="donut__swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="donut__label">{s.label}</span>
              <span className="num small muted">{s.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
