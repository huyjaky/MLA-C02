import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Crown, DoorOpen, Flag, Hammer, Play, Plus, Shield, Sparkles, Swords, Trophy, UserRound, X } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { usePoll, useTicker } from '../state/hooks'
import { PageHeader } from '../components/PageHeader'
import { Segmented } from '../components/Segmented'
import { QuestionCard } from '../components/quiz/QuestionCard'
import { Fighter, HealthBar } from '../components/arena/Fighter'
import { DuelRules } from '../core/DuelRules'
import { QuestionDifficulty } from '../core/QuestionDifficulty'
import { QuizSession } from '../core/QuizSession'

const LOBBY_POLL_MS = 2000
const MATCH_POLL_MS = 700
const ACTION_ICONS = { attack: Swords, break: Hammer, defend: Shield, buff: Sparkles }
const KNOWN_ERRORS = ['not_online', 'busy', 'no_challenge', 'no_room', 'room_full', 'room_not_full', 'not_host']
const TEAMS = ['A', 'B']
const TONES = { A: ['var(--tab-2)', 'var(--tab-10)'], B: ['var(--tab-1)', 'var(--tab-9)'] }
const TAKEN_ORDER = ['pierced', 'hit', 'blocked', 'miss'] // the pop shows the hardest of several hits

export function DuelPage() {
  const [matchId, setMatchId] = useState(null)
  return matchId ? <Arena matchId={matchId} onExit={() => setMatchId(null)} /> : <Lobby onMatch={setMatchId} />
}

/** Lobby: challenge someone online, or open / join a room (1v1 or 2v2) and start when every seat is taken. */
function Lobby({ onMatch }) {
  const { api, user, l } = useApp()
  const [presence, setPresence] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('1v1')
  const [rounds, setRounds] = useState(6)

  const take = (data) => {
    setPresence(data)
    if (data.matchId) onMatch(data.matchId)
  }
  usePoll(() => api.arena('presence').then(take, () => setError('network')), LOBBY_POLL_MS)

  const call = async (action, body) => {
    setError(null)
    try {
      const data = await api.arena(action, body)
      if (data.matchId) return onMatch(data.matchId)
      take(await api.arena('presence'))
    } catch (e) {
      setError(KNOWN_ERRORS.includes(e.code) ? e.code : 'network')
    }
  }
  const room = presence?.room
  const roundOptions = DuelRules.ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) }))

  return (
    <div className="page">
      <PageHeader
        title={l.ui('duel.title')}
        lead={l.ui('duel.lead')}
        aside={
          presence?.myElo && (
            <dl className="elo-mine" aria-label={l.ui('duel.eloMine')}>
              {Object.entries(presence.myElo).map(([mode, elo]) => (
                <div key={mode}>
                  <dt>Elo {mode}</dt>
                  <dd className="num">{elo}</dd>
                </div>
              ))}
            </dl>
          )
        }
      />
      {error && <p className="plan-alert" role="alert">{l.ui(`duel.error.${error}`)}</p>}

      {presence?.challenges.length > 0 && (
        <section className="duel-invites" aria-label={l.ui('duel.invites')}>
          {presence.challenges.map((c) => (
            <div key={c.from} className="duel-invite">
              <Swords size={20} aria-hidden="true" />
              <p>{l.ui('duel.invited', { name: c.username, rounds: c.rounds })}</p>
              <button type="button" className="btn btn--primary" onClick={() => call('respond', { from: c.from, accept: true })}>
                <Check size={16} aria-hidden="true" /> {l.ui('duel.accept')}
              </button>
              <button type="button" className="btn" onClick={() => call('respond', { from: c.from, accept: false })}>
                <X size={16} aria-hidden="true" /> {l.ui('duel.decline')}
              </button>
            </div>
          ))}
        </section>
      )}

      {room ? (
        <RoomPanel room={room} me={user.id} call={call} />
      ) : (
        <div className="duel-lobby">
          <section className="panel" aria-labelledby="rooms-h">
            <h2 id="rooms-h">{l.ui('duel.rooms')}</h2>
            <div className="toolbar">
              <Segmented label={l.ui('duel.mode')} value={mode} onChange={setMode} options={Object.keys(DuelRules.TEAM_SIZE).map((m) => ({ value: m, label: m }))} />
              <Segmented label={l.ui('duel.rounds')} value={rounds} onChange={setRounds} options={roundOptions} />
              <button type="button" className="btn btn--primary" onClick={() => call('room/create', { mode, rounds })}>
                <Plus size={16} aria-hidden="true" /> {l.ui('duel.createRoom')}
              </button>
            </div>
            <p className="muted small">{l.ui('duel.roundsHint', { n: rounds })}</p>
            {!presence ? (
              <p className="muted" role="status">{l.ui('comp.loading')}</p>
            ) : presence.rooms.length === 0 ? (
              <p className="muted">{l.ui('duel.noRooms')}</p>
            ) : (
              <ul className="duel-rooms">
                {presence.rooms.map((r) => (
                  <li key={r.id} className="duel-room">
                    <span className="duel-room__who">
                      <strong>{l.ui('duel.roomOf', { name: r.hostName })}</strong>
                      <small className="muted">{r.mode} · {l.ui('duel.roundsN', { n: r.rounds })}</small>
                    </span>
                    {TEAMS.map((t) => (
                      <button key={t} type="button" className="btn btn--sm" disabled={r.seats[t].length >= r.size} onClick={() => call('room/join', { id: r.id, team: t })}>
                        {l.ui('duel.team', { t })} <span className="num">{r.seats[t].length}/{r.size}</span>
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="online-h">
            <h2 id="online-h">{l.ui('duel.online')}</h2>
            <p className="muted small">{l.ui('duel.challengeHint', { n: rounds })}</p>
            {!presence ? (
              <p className="muted" role="status">{l.ui('comp.loading')}</p>
            ) : presence.online.length === 0 ? (
              <p className="muted">{l.ui('duel.nobody')}</p>
            ) : (
              <ul className="duel-players">
                {presence.online.map((p) => (
                  <li key={p.id} className="duel-player">
                    <UserRound size={18} aria-hidden="true" />
                    <span className="duel-player__who">
                      <strong>{p.username}</strong>
                      <small className="muted">
                        Elo <span className="num">{p.elo}</span> · {p.busy ? l.ui('duel.busy') : p.challenged ? l.ui('duel.waiting') : l.ui('duel.free')}
                      </small>
                    </span>
                    <button type="button" className="btn" disabled={p.busy || p.challenged} onClick={() => call('challenge', { to: p.id, rounds })}>
                      <Swords size={16} aria-hidden="true" /> {l.ui('duel.challenge')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Rules />
    </div>
  )
}

/** A lobby room: both teams' seats, switching seats, and the host's start button. */
function RoomPanel({ room, me, call }) {
  const { l } = useApp()
  const isHost = room.host === me
  return (
    <section className="panel room" aria-labelledby="room-h">
      <div className="room__head">
        <h2 id="room-h">{l.ui('duel.roomOf', { name: room.hostName })}</h2>
        <span className="duel-chip">{room.mode} · {l.ui('duel.roundsN', { n: room.rounds })}</span>
      </div>
      <div className="room__teams">
        {TEAMS.map((t) => {
          const seated = room.seats[t].some((s) => s.id === me)
          return (
            <div key={t} className="room__team" data-team={t}>
              <h3>{l.ui('duel.team', { t })}</h3>
              <ul>
                {Array.from({ length: room.size }, (_, i) => room.seats[t][i]).map((seat, i) => (
                  <li key={i} className="room__seat" data-empty={!seat}>
                    {seat ? (
                      <>
                        {seat.id === room.host ? <Crown size={15} aria-label={l.ui('duel.host')} /> : <UserRound size={15} aria-hidden="true" />}
                        <span>{seat.username}{seat.id === me ? ` (${l.ui('duel.you')})` : ''}</span>
                        <span className="room__elo num">{seat.elo}</span>
                      </>
                    ) : (
                      <span className="muted">{l.ui('duel.emptySeat')}</span>
                    )}
                  </li>
                ))}
              </ul>
              {!seated && room.seats[t].length < room.size && (
                <button type="button" className="btn btn--sm" onClick={() => call('room/join', { id: room.id, team: t })}>{l.ui('duel.join')}</button>
              )}
            </div>
          )
        })}
      </div>
      <div className="room__actions">
        <button type="button" className="btn" onClick={() => call('room/leave')}><DoorOpen size={16} aria-hidden="true" /> {l.ui('duel.leaveRoom')}</button>
        {isHost && (
          <button type="button" className="btn btn--primary" disabled={!room.full} onClick={() => call('room/start')}>
            <Play size={16} aria-hidden="true" /> {l.ui('duel.start')}
          </button>
        )}
        <p className="muted small">{room.full ? (isHost ? '' : l.ui('duel.waitHost')) : l.ui('duel.waitFull')}</p>
      </div>
    </section>
  )
}

/** The four moves and the level table, so the counters can be read before a match. */
function Rules() {
  const { l } = useApp()
  return (
    <section className="panel duel-rules" aria-labelledby="rules-h">
      <h2 id="rules-h">{l.ui('duel.rules')}</h2>
      <div className="duel-rules__grid">
        <ul className="duel-rules__actions">
          {DuelRules.ACTIONS.map((a) => {
            const Icon = ACTION_ICONS[a]
            return (
              <li key={a}>
                <Icon size={18} aria-hidden="true" />
                <span><strong>{l.ui(`duel.action.${a}`)}</strong> {l.ui(`duel.actionHint.${a}`)}</span>
              </li>
            )
          })}
        </ul>
        <div>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{l.ui('surv.level')}</th>
                <th scope="col" className="num">{l.ui('duel.time')}</th>
                <th scope="col" className="num">{l.ui('duel.power')}</th>
              </tr>
            </thead>
            <tbody>
              {QuestionDifficulty.LEVELS.map((v) => (
                <tr key={v}>
                  <td>{l.ui(`level.${v}`)}</td>
                  <td className="num">{DuelRules.ANSWER_SECONDS[v]}s</td>
                  <td className="num">{DuelRules.POWER[v]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{l.ui('duel.speedRule', { hp: DuelRules.MAX_HP, choose: DuelRules.CHOOSE_SECONDS })}</p>
        </div>
      </div>
    </section>
  )
}

/** Countdown bar to `until` (server clock), drawn from `from`. */
function Countdown({ from, until, now, label }) {
  const left = Math.max(0, until - now)
  const ratio = Math.min(1, left / Math.max(1, until - from))
  return (
    <div className="countdown" data-urgent={left < 5000}>
      <span className="countdown__track"><span className="countdown__fill" style={{ '--left': ratio }} /></span>
      <span className="num countdown__secs" aria-label={label}>{Math.ceil(left / 1000)}s</span>
    </div>
  )
}

/** One running match (1v1 or 2v2): stage with every fighter, then the panel for the current phase. */
function Arena({ matchId, onExit }) {
  const { api, repo, l } = useApp()
  const [view, setView] = useState(null)
  const [offset, setOffset] = useState(0) // server clock minus local clock
  const [lost, setLost] = useState(false)
  const [pick, setPick] = useState({ action: null, level: null, target: null })
  const [busy, setBusy] = useState(false)
  const [, bump] = useReducer((n) => n + 1, 0)
  useTicker(200) // countdowns move between polls

  const take = useCallback((data) => {
    setOffset(data.serverNow - Date.now())
    setView(data)
    setLost(false)
  }, [])

  usePoll(
    async () => {
      try {
        take(await api.arena('match', { id: matchId }))
      } catch (e) {
        if (e.code === 'no_match') onExit()
        else setLost(true)
      }
    },
    MATCH_POLL_MS,
    !view?.over,
  )

  const questionId = view?.move?.questionId
  const session = useMemo(() => {
    const q = questionId != null && repo.questionsByIds([questionId])[0]
    return q ? new QuizSession({ id: 'duel', questions: [q] }) : null
  }, [questionId, repo])

  // a new round clears the picks
  const round = view?.round
  useEffect(() => setPick({ action: null, level: null, target: null }), [round])

  if (!view) return <div className="page"><p className="muted" role="status">{l.ui('comp.loading')}</p></div>

  const now = Date.now() + offset
  const { last, fighters } = view
  const me = fighters.find((f) => f.id === view.me)
  const byId = new Map(fighters.map((f) => [f.id, f]))
  const nameOf = (id) => byId.get(id)?.username ?? '?'
  const phase = view.over
    ? 'over'
    : now < view.roundStart
      ? last ? 'result' : 'intro'
      : me.hp === 0
        ? 'out'
        : !view.move
          ? now <= view.chooseUntil ? 'choose' : 'wait'
          : !view.move.answered && now <= view.move.deadline ? 'answer' : 'wait'
  const showLast = Boolean((phase === 'result' || phase === 'over') && last)
  const teamSize = DuelRules.TEAM_SIZE[view.mode]
  // who a pick may aim at: standing enemies for attack / break, standing teammates for defend / buff
  const targets = pick.action ? fighters.filter((f) => f.hp > 0 && (DuelRules.targetsEnemy(pick.action) ? f.team !== view.team : f.team === view.team)) : []

  const send = async (verb, body) => {
    setBusy(true)
    try {
      take(await api.arena(verb, body))
    } catch (e) {
      if (e.code === 'no_match') onExit()
    } finally {
      setBusy(false)
    }
  }
  const choose = (patch) =>
    setPick((p) => {
      const next = { ...p, ...patch }
      // switching between an enemy move and a support move drops a target from the other side
      if (patch.action && DuelRules.targetsEnemy(patch.action) !== DuelRules.targetsEnemy(p.action ?? '')) next.target = null
      return next
    })
  const submitAnswer = async () => {
    const picked = [...session.selectionOf(session.current)]
    session.check() // show the verdict on the card while the others finish
    bump()
    await send('answer', { picked })
  }
  const surrender = async () => {
    if (!window.confirm(l.ui('duel.surrenderConfirm'))) return
    await api.arena('leave').catch(() => {})
    await send('match', { id: matchId })
  }

  /** Damage and effects one fighter took in the round on show. */
  const takenBy = (id) => {
    if (!showLast) return null
    const hits = last.hits.filter((h) => h.to === id && h.from !== id && TAKEN_ORDER.includes(h.kind))
    if (!hits.length) {
      return last.hits.some((h) => h.from === id && h.kind === 'interrupted') ? { kind: 'interrupted', damage: 0, label: l.ui('duel.kind.interrupted') } : null
    }
    const kind = TAKEN_ORDER.find((k) => hits.some((h) => h.kind === k))
    return { kind, damage: hits.reduce((sum, h) => sum + h.damage, 0), label: l.ui(`duel.kind.${kind}`) }
  }

  const fighterOf = (f) => {
    const info = showLast ? last.players[f.id] : null
    const slot = fighters.filter((x) => x.team === f.team).indexOf(f)
    const statusNow = info ? { guarded: info.guarded, buffed: info.buffed } : { guarded: f.guarded, buffed: f.buffed }
    return (
      <Fighter
        key={`${f.id}-${last?.round ?? 0}-${showLast ? 'shown' : 'live'}`}
        name={f.username}
        side={f.team === 'A' ? 'left' : 'right'}
        slot={slot}
        tone={TONES[f.team][slot]}
        pose={info?.move?.action ?? (f.hp > 0 && (phase === 'answer' || phase === 'wait') ? 'ready' : 'idle')}
        taken={takenBy(f.id)}
        status={{
          ...statusNow,
          shielding: info?.next.guarded,
          empowering: info?.next.buffed,
          interrupted: showLast && last.hits.some((h) => h.from === f.id && h.kind === 'interrupted'),
        }}
        ko={(info ? info.hp : f.hp) === 0}
        tag={f.id === view.me ? l.ui('duel.you') : teamSize > 1 ? f.username : null}
      />
    )
  }

  const statusNote = (f) => {
    const s = showLast ? last.players[f.id] : f
    if (view.over || (showLast ? s.hp : f.hp) === 0) return null
    return [s.guarded && l.ui('duel.guarded'), s.buffed && l.ui('duel.buffed')].filter(Boolean).join(' · ') || null
  }

  const reportLines = () =>
    fighters.flatMap((f) => {
      const info = last.players[f.id]
      // fighters already down before this round are left out
      if (!info.move) return info.hp > 0 || last.hits.some((h) => h.to === f.id) ? [l.ui('duel.didNothing', { name: f.username })] : []
      const hit = last.hits.find((h) => h.from === f.id)
      return [
        l.ui('duel.hitLine', {
          from: f.username,
          to: hit?.to === f.id ? l.ui('duel.self') : nameOf(hit?.to),
          action: l.ui(`duel.action.${info.move.action}`),
          level: l.ui(`level.${info.move.level}`),
          verdict: l.ui(info.move.correct ? 'quiz.correct' : 'quiz.incorrect'),
          effect: hit ? l.ui(`duel.kind.${hit.kind}`) + (hit.damage ? ` -${hit.damage}` : '') : '',
        }),
      ]
    })

  const result = DuelRules.outcomeFor(view.winner, view.team)
  const waitingOn = fighters.filter((f) => f.hp > 0 && f.id !== view.me && !f.answered).map((f) => f.username)

  return (
    <div className="page arena-page">
      <section className="stage" data-mode={view.mode} aria-label={l.ui('duel.stage')}>
        <div className="stage__bars">
          {TEAMS.map((t, i) => (
            <div key={t} className="stage__team" data-side={i ? 'right' : 'left'}>
              {fighters.filter((f) => f.team === t).map((f) => (
                <HealthBar
                  key={f.id}
                  name={f.id === view.me ? `${f.username} (${l.ui('duel.you')})` : f.username}
                  hp={showLast ? last.players[f.id].hp : f.hp}
                  max={DuelRules.MAX_HP}
                  side={i ? 'right' : 'left'}
                  label={l.ui('duel.hpOf', { name: f.username })}
                  status={statusNote(f)}
                />
              ))}
            </div>
          ))}
          <span className="stage__round num">{l.ui('duel.roundOf', { n: showLast ? last.round : view.round, max: view.maxRounds })}</span>
        </div>
        <div className="stage__floor">
          {fighters.map(fighterOf)}
          {phase === 'intro' && <span className="stage__call">{l.ui('duel.fight')}</span>}
          {phase === 'over' && <span className={`stage__call stage__call--${result}`}>{l.ui(`duel.result.${result}`)}</span>}
        </div>
        {lost && <p className="stage__lost small" role="status">{l.ui('duel.reconnecting')}</p>}
      </section>

      {showLast && (
        <div className="round-report" aria-live="polite">
          {reportLines().map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}

      {phase === 'choose' && (
        <section className="panel duel-pick" aria-labelledby="pick-h">
          <div className="duel-pick__head">
            <h2 id="pick-h">{l.ui('duel.pickTitle')}</h2>
            <Countdown from={view.roundStart} until={view.chooseUntil} now={now} label={l.ui('duel.timeLeft')} />
          </div>
          <div className="duel-pick__group duel-pick__group--actions" role="radiogroup" aria-label={l.ui('duel.actionLabel')}>
            {DuelRules.ACTIONS.map((a) => {
              const Icon = ACTION_ICONS[a]
              return (
                <button key={a} type="button" role="radio" aria-checked={pick.action === a} className="pick" data-kind={a} onClick={() => choose({ action: a })}>
                  <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
                  <strong>{l.ui(`duel.action.${a}`)}</strong>
                  <small>{l.ui(`duel.actionHint.${a}`)}</small>
                </button>
              )
            })}
          </div>
          {targets.length > 1 && (
            <div className="duel-pick__targets">
              <span className="muted small">{l.ui('duel.target')}</span>
              <Segmented
                label={l.ui('duel.target')}
                value={pick.target ?? targets[0].id}
                onChange={(target) => choose({ target })}
                options={targets.map((f) => ({ value: f.id, label: `${f.id === view.me ? l.ui('duel.you') : f.username} · ${f.hp}` }))}
              />
            </div>
          )}
          <div className="duel-pick__group" role="radiogroup" aria-label={l.ui('surv.level')}>
            {QuestionDifficulty.LEVELS.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={pick.level === v} className="pick pick--level" onClick={() => choose({ level: v })}>
                <strong>{l.ui(`level.${v}`)}</strong>
                <small className="num">{DuelRules.ANSWER_SECONDS[v]}s · {l.ui('duel.power')} {DuelRules.POWER[v]}</small>
              </button>
            ))}
          </div>
          <div className="duel-pick__go">
            <p className="muted small">{pick.action && pick.level ? l.ui('duel.goHint') : l.ui('duel.needBoth')}</p>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={!pick.action || !pick.level || busy}
              onClick={() => send('move', { action: pick.action, level: pick.level, target: pick.target ?? targets[0]?.id ?? null })}
            >
              {l.ui('duel.go')}
            </button>
          </div>
        </section>
      )}

      {session && (phase === 'answer' || phase === 'wait') && (
        <section className="duel-question" aria-label={l.ui('duel.question')}>
          <div className="duel-question__bar">
            <span className="duel-chip">
              {l.ui(`duel.action.${view.move.action}`)} · {l.ui(`level.${view.move.level}`)}
              {view.move.target != null && teamSize > 1 ? ` → ${view.move.target === view.me ? l.ui('duel.you') : nameOf(view.move.target)}` : ''}
            </span>
            {phase === 'answer' && (
              <>
                <span className="duel-chip duel-chip--power num">
                  {l.ui('duel.power')} {Math.round(DuelRules.speed({ level: view.move.level, answeredMs: now - view.roundStart }) * 100)}%
                </span>
                <Countdown from={view.roundStart} until={view.move.deadline} now={now} label={l.ui('duel.timeLeft')} />
              </>
            )}
          </div>
          <QuestionCard key={questionId} session={session} onChoose={(i) => { session.choose(i); bump() }} />
          {phase === 'answer' && (
            <div className="quiz__nav">
              <button type="button" className="btn btn--primary" disabled={!session.selectionOf(session.current).size || busy} onClick={submitAnswer}>
                {l.ui('duel.lockIn')}
              </button>
            </div>
          )}
        </section>
      )}

      {phase === 'wait' && (
        <p className="duel-wait muted" role="status">
          {waitingOn.length ? l.ui('duel.waitingFor', { names: waitingOn.join(', ') }) : l.ui('duel.resolving')}
        </p>
      )}
      {phase === 'out' && <p className="duel-wait muted" role="status">{l.ui('duel.knockedOut')}</p>}

      {phase === 'over' && view.elo && (
        <section className="elo-change" aria-label={l.ui('duel.eloChanges')}>
          <h2>{l.ui('duel.eloChanges')}</h2>
          <ul>
            {fighters.map((f) => {
              const change = view.elo[f.id]
              return (
                <li key={f.id} aria-current={f.id === view.me || undefined}>
                  <span>{f.id === view.me ? `${f.username} (${l.ui('duel.you')})` : f.username}</span>
                  <span className="num">{change.before} → {change.after}</span>
                  <strong className="num" data-sign={Math.sign(change.delta)}>{change.delta > 0 ? '+' : ''}{change.delta}</strong>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="duel-end">
        {phase === 'over' ? (
          <>
            <button type="button" className="btn btn--primary" onClick={onExit}>{l.ui('duel.backToLobby')}</button>
            <Link to="/competitive" className="btn"><Trophy size={16} aria-hidden="true" /> {l.ui('comp.boards')}</Link>
          </>
        ) : (
          <button type="button" className="btn" onClick={surrender}><Flag size={16} aria-hidden="true" /> {l.ui('duel.surrender')}</button>
        )}
      </div>
    </div>
  )
}
