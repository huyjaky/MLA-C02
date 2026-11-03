import { Skull } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { QuestionDifficulty } from '../core/QuestionDifficulty'
import { Segmented } from './Segmented'

/** Question level (easy / medium / hard) plus the hardcore toggle, for survival and its leaderboard. */
export function LevelPicker({ level, onLevel, hardcore, onHardcore }) {
  const { l } = useApp()
  return (
    <div className="toolbar">
      <Segmented
        label={l.ui('surv.level')}
        value={level}
        onChange={onLevel}
        options={QuestionDifficulty.LEVELS.map((v) => ({ value: v, label: l.ui(`level.${v}`) }))}
      />
      <button type="button" className="toggle" aria-pressed={hardcore} onClick={() => onHardcore(!hardcore)}>
        <Skull size={16} aria-hidden="true" /> {l.ui('surv.hardcore')}
      </button>
    </div>
  )
}
