/**
 * A standing index card with a divider tab: the duel fighter. `side` mirrors it, `pose` and `taken`
 * pick the round's CSS animation (the parent keys it by round, so every round replays), `tone` colours the tab.
 * `guarded`: wearing the card sleeve this round; `shielding`: a correct defend slips a new sleeve on for next round.
 */
export function Fighter({ name, side, tone, pose = 'idle', taken, guarded = false, shielding = false, ko = false }) {
  return (
    <div
      className="fighter"
      data-side={side}
      data-pose={pose}
      data-taken={taken?.kind ?? 'none'}
      data-guarded={guarded}
      data-shielding={shielding}
      data-ko={ko}
    >
      <div className="fighter__body">
        <svg viewBox="0 0 120 168" aria-hidden="true" className="fighter__card">
          <rect x="22" y="4" width="44" height="22" rx="4" fill={tone} />
          <text x="44" y="20" textAnchor="middle" className="fighter__initial">{name.slice(0, 1).toUpperCase()}</text>
          <rect x="8" y="18" width="104" height="142" rx="5" className="fighter__stock" />
          <line x1="8" y1="44" x2="112" y2="44" className="fighter__rule-red" />
          {[60, 76, 92, 108, 124, 140].map((y) => (
            <line key={y} x1="8" y1={y} x2="112" y2={y} className="fighter__rule-blue" />
          ))}
          <g className="fighter__face">
            <path d="M40 70 l14 5 M80 70 l-14 5" className="fighter__brow" />
            <ellipse cx="47" cy="84" rx="4.5" ry="6" className="fighter__eye" />
            <ellipse cx="73" cy="84" rx="4.5" ry="6" className="fighter__eye" />
            <path d="M50 104 q10 -6 20 0" className="fighter__mouth" />
          </g>
        </svg>
        <span className="fighter__sleeve" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <i key={i} className="fighter__shard" />)}
        </span>
      </div>
      <span className="fighter__shadow" aria-hidden="true" />
      {taken && taken.kind !== 'none' && (
        <span className={`fighter__pop fighter__pop--${taken.kind}`} aria-hidden="true">
          {taken.damage > 0 ? `-${taken.damage}` : taken.label}
        </span>
      )}
    </div>
  )
}

/** HP bar whose lost part lingers as a ghost before draining, so every hit reads; `status` is a note under it. */
export function HealthBar({ name, hp, max, side, label, status }) {
  const ratio = Math.max(0, hp) / max
  return (
    <div className="hp" data-side={side}>
      <div className="hp__head">
        <strong>{name}</strong>
        <span className="num">{hp}/{max}</span>
      </div>
      <div className="hp__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp}>
        <span className="hp__ghost" style={{ '--hp': ratio }} />
        <span className="hp__fill" style={{ '--hp': ratio }} data-low={ratio <= 0.3} />
      </div>
      {status && <span className="hp__status">{status}</span>}
    </div>
  )
}
