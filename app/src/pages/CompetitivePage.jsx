import { useState } from 'react'
import { HeartPulse, Swords } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { useAsync } from '../state/hooks'
import { PageHeader } from '../components/PageHeader'
import { Segmented } from '../components/Segmented'
import { TodayLink } from '../components/TodayLink'
import { LevelPicker } from '../components/LevelPicker'
import { SurvivalRun } from '../core/SurvivalRun'
import { DuelRules } from '../core/DuelRules'

/** Rank cell: the podium gets a rubber-stamp mark, everyone else a plain number. */
function Rank({ n }) {
  return n <= 3 ? <span className={`rank-stamp rank-stamp--${n}`}>{n}</span> : <span className="num muted">{n}</span>
}

/** One leaderboard table; the signed-in account's row is marked. */
function Board({ rows, columns, me, empty, caption }) {
  if (!rows?.length) return <p className="muted board__empty">{empty}</p>
  return (
    <table className="table board">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">{columns[0].label}</th>
          {columns.slice(1).map((c) => <th key={c.key} scope="col" className="num">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.username} aria-current={row.username === me || undefined}>
            <td className="board__rank"><Rank n={i + 1} /></td>
            <th scope="row" className="board__name">{row.username}</th>
            {columns.slice(1).map((c) => <td key={c.key} className="num">{c.format ? c.format(row[c.key]) : row[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Competitive hub: the two games, then the study ranking and one ranking per game (and per survival mode). */
export function CompetitivePage() {
  const { api, user, repo, l } = useApp()
  const loaded = useAsync(() => api.leaderboards().catch(() => ({ error: true })), [api])
  const boards = loaded?.error ? null : loaded
  const [tab, setTab] = useState('study')
  const [level, setLevel] = useState('medium')
  const [hardcore, setHardcore] = useState(false)
  const [duelMode, setDuelMode] = useState('1v1')

  const player = { key: 'username', label: l.ui('comp.player') }
  const tables = {
    study: {
      rows: boards?.study,
      columns: [
        player,
        { key: 'lectures', label: l.ui('comp.lectures'), format: (n) => `${n}/${repo.lectureCount}` },
        { key: 'exam', label: l.ui('comp.examAvg'), format: (n) => `${n}%` },
        { key: 'cards', label: l.ui('comp.cards') },
      ],
    },
    duel: {
      rows: boards?.duel[duelMode],
      columns: [player, { key: 'wins', label: l.ui('comp.wins') }, { key: 'losses', label: l.ui('comp.losses') }, { key: 'draws', label: l.ui('comp.draws') }],
    },
    survival: {
      rows: boards?.survival[SurvivalRun.modeKey(level, hardcore)],
      columns: [player, { key: 'score', label: l.ui('comp.score') }, { key: 'streak', label: l.ui('comp.bestStreak') }, { key: 'runs', label: l.ui('comp.runs') }],
    },
  }

  return (
    <div className="page">
      <PageHeader title={l.ui('nav.competitive')} lead={l.ui('comp.lead')} />

      <section className="today arena-launch" aria-label={l.ui('comp.games')}>
        <TodayLink primary to="/competitive/duel" icon={Swords} label={l.ui('comp.duelHint')} value={l.ui('duel.title')} />
        <TodayLink to="/competitive/survival" icon={HeartPulse} label={l.ui('comp.survivalHint')} value={l.ui('surv.title')} />
      </section>

      <section className="panel board-panel" aria-labelledby="boards-h">
        <div className="board-panel__head">
          <h2 id="boards-h">{l.ui('comp.boards')}</h2>
          <Segmented
            label={l.ui('comp.boards')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'study', label: l.ui('comp.study') },
              { value: 'duel', label: l.ui('duel.title') },
              { value: 'survival', label: l.ui('surv.title') },
            ]}
          />
        </div>
        {tab === 'duel' && (
          <div className="toolbar">
            <Segmented label={l.ui('duel.mode')} value={duelMode} onChange={setDuelMode} options={Object.keys(DuelRules.TEAM_SIZE).map((m) => ({ value: m, label: m }))} />
          </div>
        )}
        {tab === 'survival' && <LevelPicker level={level} onLevel={setLevel} hardcore={hardcore} onHardcore={setHardcore} />}
        {loaded?.error ? (
          <p className="plan-alert" role="alert">{l.ui('comp.loadError')}</p>
        ) : !boards ? (
          <p className="muted" role="status">{l.ui('comp.loading')}</p>
        ) : (
          <Board {...tables[tab]} me={user.username} empty={l.ui('comp.empty')} caption={l.ui('comp.boards')} />
        )}
      </section>
    </div>
  )
}
