import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Flag, Hammer, Shield, Swords, Trophy, UserRound, X } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { usePoll, useTicker } from '../state/hooks'
import { PageHeader } from '../components/PageHeader'
import { QuestionCard } from '../components/quiz/QuestionCard'
import { Fighter, HealthBar } from '../components/arena/Fighter'
import { DuelRules } from '../core/DuelRules'
import { QuestionDifficulty } from '../core/QuestionDifficulty'
import { QuizSession } from '../core/QuizSession'

const LOBBY_POLL_MS = 2500
const MATCH_POLL_MS = 700
const ACTION_ICONS = { attack: Swords, break: Hammer, defend: Shield }
const LOBBY_ERRORS = ['not_online', 'busy', 'no_challenge']

export function DuelPage() {
  const [matchId, setMatchId] = useState(null)
  return matchId ? <Arena matchId={matchId} onExit={() => setMatchId(null)} /> : <Lobby onMatch={setMatchId} />
}

/** Who is online, challenges in and out, and the rules at a glance. */
function Lobby({ onMatch }) {
  const { api, l } = useApp()
  const [presence, setPresence] = useState(null)
  const [error, setError] = useState(null)

  usePoll(async () => {
    try {
      const data = await api.arena('presence')
      setPresence(data)
      if (data.matchId) onMatch(data.matchId)
    } catch {
      setError('network')
    }
  }, LOBBY_POLL_MS)

  const call = async (action, body) => {
    setError(null)
    try {
      const data = await api.arena(action, body)
      if (data.matchId) onMatch(data.matchId)
      setPresence(await api.arena('presence'))
    } catch (e) {
      setError(LOBBY_ERRORS.includes(e.code) ? e.code : 'network')
    }
  }

  return (
    <div className="page">
      <PageHeader title={l.ui('duel.title')} lead={l.ui('duel.lead')} />
      {error && <p className="plan-alert" role="alert">{l.ui(`duel.error.${error}`)}</p>}

      {presence?.challenges.length > 0 && (
        <section className="duel-invites" aria-label={l.ui('duel.invites')}>
          {presence.challenges.map((c) => (
            <div key={c.from} className="duel-invite">
              <Swords size={20} aria-hidden="true" />
              <p>{l.ui('duel.invited', { name: c.username })}</p>
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

      <div className="duel-lobby">
        <section className="panel" aria-labelledby="online-h">
          <h2 id="online-h">{l.ui('duel.online')}</h2>
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
                    <small className="muted">{p.busy ? l.ui('duel.busy') : p.challenged ? l.ui('duel.waiting') : l.ui('duel.free')}</small>
                  </span>
                  <button type="button" className="btn" disabled={p.busy || p.challenged} onClick={() => call('challenge', { to: p.id })}>
                    <Swords size={16} aria-hidden="true" /> {l.ui('duel.challenge')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel duel-rules" aria-labelledby="rules-h">
          <h2 id="rules-h">{l.ui('duel.rules')}</h2>
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
        </section>
      </div>
    </div>
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

/** One running match: stage with both fighters, then the panel for the current phase. */
function Arena({ matchId, onExit }) {
  const { api, repo, l } = useApp()
  const [view, setView] = useState(null)
  const [offset, setOffset] = useState(0) // server clock minus local clock
  const [lost, setLost] = useState(false)
  const [action, setAction] = useState(null)
  const [level, setLevel] = useState(null)
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
  useEffect(() => {
    setAction(null)
    setLevel(null)
  }, [round])

  if (!view) return <div className="page"><p className="muted" role="status">{l.ui('comp.loading')}</p></div>

  const now = Date.now() + offset
  const { me, opponent, last } = view
  const phase = view.over
    ? 'over'
    : now < view.roundStart
      ? last ? 'result' : 'intro'
      : !view.move
        ? now <= view.chooseUntil ? 'choose' : 'wait'
        : !view.move.answered && now <= view.move.deadline ? 'answer' : 'wait'
  const showLast = (phase === 'result' || phase === 'over') && last
  const label = (taken) => taken && { ...taken, label: l.ui(`duel.kind.${taken.kind}`) }

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
  const submitAnswer = async () => {
    const picked = [...session.selectionOf(session.current)]
    session.check() // show the verdict on the card while the opponent finishes
    bump()
    await send('answer', { picked })
  }
  const surrender = async () => {
    if (!window.confirm(l.ui('duel.surrenderConfirm'))) return
    await api.arena('leave').catch(() => {})
    await send('match', { id: matchId })
  }

  const fighter = (p, side, tone) => {
    const info = showLast ? last.players[p.id] : null
    return (
      <Fighter
        key={`${p.id}-${last?.round ?? 0}-${showLast ? 'shown' : 'live'}`}
        name={p.username}
        side={side}
        tone={tone}
        pose={info?.move?.action ?? (phase === 'answer' || phase === 'wait' ? 'ready' : 'idle')}
        taken={label(info?.taken)}
        guarded={info ? info.guarded : p.guarded}
        shielding={Boolean(info?.guardsNext)}
        ko={view.over && p.hp === 0}
      />
    )
  }

  const outcomeLine = (p, other) => {
    const info = last.players[p.id]
    if (!info.move) return l.ui('duel.didNothing', { name: p.username })
    const dealt = last.players[other.id].taken
    return l.ui('duel.roundLine', {
      name: p.username,
      action: l.ui(`duel.action.${info.move.action}`),
      level: l.ui(`level.${info.move.level}`),
      verdict: l.ui(info.move.correct ? 'quiz.correct' : 'quiz.incorrect'),
      effect: l.ui(`duel.kind.${dealt.kind}`) + (dealt.damage ? ` -${dealt.damage}` : ''),
    })
  }

  const result = DuelRules.outcomeFor(view.winner, me.id)
  // during the result pause the bars still describe the round just played
  const guardNote = (p) => ((showLast ? last.players[p.id].guarded : p.guarded) && !view.over ? l.ui('duel.guarded') : null)

  return (
    <div className="page arena-page">
      <section className="stage" aria-label={l.ui('duel.stage')}>
        <div className="stage__bars">
          <HealthBar name={me.username} hp={me.hp} max={DuelRules.MAX_HP} side="left" label={l.ui('duel.hpOf', { name: me.username })} status={guardNote(me)} />
          <span className="stage__round num">{l.ui('duel.round', { n: showLast ? last.round : view.round })}</span>
          <HealthBar name={opponent.username} hp={opponent.hp} max={DuelRules.MAX_HP} side="right" label={l.ui('duel.hpOf', { name: opponent.username })} status={guardNote(opponent)} />
        </div>
        <div className="stage__floor">
          {fighter(me, 'left', 'var(--tab-2)')}
          {fighter(opponent, 'right', 'var(--tab-1)')}
          {phase === 'intro' && <span className="stage__call">{l.ui('duel.fight')}</span>}
          {phase === 'over' && <span className={`stage__call stage__call--${result}`}>{l.ui(`duel.result.${result}`)}</span>}
        </div>
        {lost && <p className="stage__lost small" role="status">{l.ui('duel.reconnecting')}</p>}
      </section>

      {showLast && (
        <div className="round-report" aria-live="polite">
          <p>{outcomeLine(me, opponent)}</p>
          <p>{outcomeLine(opponent, me)}</p>
        </div>
      )}

      {phase === 'choose' && (
        <section className="panel duel-pick" aria-labelledby="pick-h">
          <div className="duel-pick__head">
            <h2 id="pick-h">{l.ui('duel.pickTitle')}</h2>
            <Countdown from={view.roundStart} until={view.chooseUntil} now={now} label={l.ui('duel.timeLeft')} />
          </div>
          <div className="duel-pick__group" role="radiogroup" aria-label={l.ui('duel.actionLabel')}>
            {DuelRules.ACTIONS.map((a) => {
              const Icon = ACTION_ICONS[a]
              return (
                <button key={a} type="button" role="radio" aria-checked={action === a} className="pick" data-kind={a} onClick={() => setAction(a)}>
                  <Icon size={26} strokeWidth={1.6} aria-hidden="true" />
                  <strong>{l.ui(`duel.action.${a}`)}</strong>
                  <small>{l.ui(`duel.actionHint.${a}`)}</small>
                </button>
              )
            })}
          </div>
          <div className="duel-pick__group" role="radiogroup" aria-label={l.ui('surv.level')}>
            {QuestionDifficulty.LEVELS.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={level === v} className="pick pick--level" onClick={() => setLevel(v)}>
                <strong>{l.ui(`level.${v}`)}</strong>
                <small className="num">{DuelRules.ANSWER_SECONDS[v]}s · {l.ui('duel.power')} {DuelRules.POWER[v]}</small>
              </button>
            ))}
          </div>
          <div className="duel-pick__go">
            <p className="muted small">{action && level ? l.ui('duel.goHint') : l.ui('duel.needBoth')}</p>
            <button type="button" className="btn btn--primary btn--lg" disabled={!action || !level || busy} onClick={() => send('move', { action, level })}>
              {l.ui('duel.go')}
            </button>
          </div>
        </section>
      )}

      {session && (phase === 'answer' || phase === 'wait') && (
        <section className="duel-question" aria-label={l.ui('duel.question')}>
          <div className="duel-question__bar">
            <span className="duel-chip">{l.ui(`duel.action.${view.move.action}`)} · {l.ui(`level.${view.move.level}`)}</span>
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
          {l.ui(opponent.answered ? 'duel.resolving' : opponent.picked ? 'duel.oppAnswering' : 'duel.oppPicking', { name: opponent.username })}
        </p>
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
