import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Flame, Heart, RotateCcw, Skull, Trophy } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { Segmented } from '../components/Segmented'
import { QuestionCard } from '../components/quiz/QuestionCard'
import { QuestionDifficulty } from '../core/QuestionDifficulty'
import { SurvivalRun } from '../core/SurvivalRun'

function shuffled(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Lives, streak and score above the card; a lost heart cracks, a growing streak flares. */
function Hud({ run, l }) {
  const max = run.hardcore ? 1 : SurvivalRun.LIVES[run.level]
  return (
    <div className="surv-hud" aria-live="polite">
      <span className="surv-hud__lives" role="img" aria-label={l.ui('surv.livesLeft', { n: run.lives })}>
        {Array.from({ length: max }, (_, i) => (
          <Heart key={i} size={22} aria-hidden="true" className="surv-heart" data-lost={i >= run.lives} fill="currentColor" />
        ))}
      </span>
      <span className="surv-hud__streak" key={run.streak} data-hot={run.streak >= 5}>
        <Flame size={18} aria-hidden="true" /> <span className="num">{run.streak}</span>
        <span className="sr-only">{l.ui('surv.streak')}</span>
      </span>
      <span className="surv-hud__score">
        <small>{l.ui('comp.score')}</small>
        <strong className="num">{run.score}</strong>
      </span>
    </div>
  )
}

/** Survival: pick a level (and hardcore), answer until the lives run out, then the score goes to the leaderboard. */
export function SurvivalPage() {
  const { repo, api, l } = useApp()
  const pools = useMemo(() => QuestionDifficulty.pools(repo.quizzes), [repo])
  const [level, setLevel] = useState('medium')
  const [hardcore, setHardcore] = useState(false)
  const [run, setRun] = useState(null)
  const [ended, setEnded] = useState(false) // the last answer stays readable until the player moves on
  const [saved, setSaved] = useState(null) // null | 'ok' | 'error'
  const [, bump] = useReducer((n) => n + 1, 0)
  const nextButton = useRef(null)

  const start = () => {
    setSaved(null)
    setEnded(false)
    setRun(new SurvivalRun({ questions: shuffled(pools[level]), level, hardcore }))
  }
  const act = (fn) => {
    fn(run)
    bump()
  }
  const revealed = run && run.isRevealed(run.current)

  // the finished run goes to the leaderboard once
  useEffect(() => {
    if (!run?.isOver || saved) return
    setSaved('pending')
    api.saveSurvival({ mode: run.boardMode, score: run.score, streak: run.bestStreak }).then(() => setSaved('ok'), () => setSaved('error'))
  }, [revealed, run, saved, api])

  useEffect(() => {
    if (revealed) nextButton.current?.focus()
  }, [revealed])

  if (!run) {
    return (
      <div className="page page--narrow">
        <PageHeader title={l.ui('surv.title')} lead={l.ui('surv.lead')} />
        <section className="panel surv-setup">
          <div className="toolbar">
            <Segmented
              label={l.ui('surv.level')}
              value={level}
              onChange={setLevel}
              options={QuestionDifficulty.LEVELS.map((v) => ({ value: v, label: l.ui(`level.${v}`) }))}
            />
            <button type="button" className="toggle" aria-pressed={hardcore} onClick={() => setHardcore(!hardcore)}>
              <Skull size={16} aria-hidden="true" /> {l.ui('surv.hardcore')}
            </button>
          </div>
          <p className="muted">
            {l.ui('surv.rules', { n: pools[level].length, lives: hardcore ? 1 : SurvivalRun.LIVES[level], points: SurvivalRun.POINTS[level] })}
          </p>
          <div>
            <button type="button" className="btn btn--primary" onClick={start}>
              {l.ui('surv.start')} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (ended) {
    const cleared = run.lives > 0
    return (
      <div className="page page--narrow">
        <PageHeader title={l.ui('surv.title')} />
        <section className="panel surv-over" aria-live="polite">
          <span className={`stamp stamp--big ${cleared ? '' : 'stamp--bad'}`}>{l.ui(cleared ? 'surv.cleared' : 'surv.gameOver')}</span>
          <dl className="surv-over__stats">
            <div><dt>{l.ui('comp.score')}</dt><dd className="num">{run.score}</dd></div>
            <div><dt>{l.ui('comp.bestStreak')}</dt><dd className="num">{run.bestStreak}</dd></div>
            <div><dt>{l.ui('surv.correct')}</dt><dd className="num">{run.correctCount}/{run.index + 1}</dd></div>
          </dl>
          <p className="muted small" role="status">
            {saved === 'ok' ? l.ui('surv.saved') : saved === 'error' ? l.ui('surv.saveError') : l.ui('comp.loading')}
          </p>
          <div className="surv-over__actions">
            <button type="button" className="btn btn--primary" onClick={start}>
              <RotateCcw size={16} aria-hidden="true" /> {l.ui('surv.again')}
            </button>
            <button type="button" className="btn" onClick={() => setRun(null)}>{l.ui('surv.changeLevel')}</button>
            <Link to="/competitive" className="btn"><Trophy size={16} aria-hidden="true" /> {l.ui('comp.boards')}</Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page page--narrow">
      <PageHeader title={l.ui('surv.title')} lead={`${l.ui(`level.${run.level}`)}${run.hardcore ? ` · ${l.ui('surv.hardcore')}` : ''}`} />
      <Hud run={run} l={l} />
      <QuestionCard key={run.current.id} session={run} onChoose={(i) => act((r) => r.choose(i))} />
      <div className="quiz__nav">
        {revealed ? (
          <button ref={nextButton} type="button" className="btn btn--primary" onClick={() => (run.isOver ? setEnded(true) : act((r) => r.next()))}>
            {l.ui(run.isOver ? 'surv.result' : 'surv.next')} <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="btn btn--primary" disabled={!run.selectionOf(run.current).size} onClick={() => act((r) => r.check())}>
            {l.ui('quiz.check')}
          </button>
        )}
      </div>
    </div>
  )
}
