import { Localizer } from '../../core/Localizer'
import { QuizSession } from '../../core/QuizSession'
import { useApp } from '../../state/AppContext'
import { useTicker } from '../../state/hooks'
import { Meter } from '../Meter'

const shortDomain = (name) => name.replace(/^Content Domain \d+:\s*/, '')

/**
 * Dashboard beside the questions: accuracy so far, by exam domain, against the pass mark (practice only, since an
 * exam reveals nothing before submit) and pace against the real sitting. Re-renders itself each second for the pace.
 */
export function LiveStats({ session }) {
  const { l } = useApp()
  useTicker(1000)
  const stats = session.liveStats()
  const pass = session.passPercent / 100
  const tone = (ratio) => (ratio >= pass ? 'ok' : 'bad')
  const domains = Object.entries(stats.byDomain)
  const target = QuizSession.SECONDS_PER_QUESTION

  return (
    <section className="live" aria-labelledby="live-h">
      <h2 id="live-h" className="live__title">{l.ui('quiz.live')}</h2>
      {!session.isExam &&
        (stats.accuracy === null ? (
          <p className="small muted">{l.ui('quiz.liveEmpty')}</p>
        ) : (
          <>
            <p className="live__score" data-tone={tone(stats.accuracy)}>
              <strong className="num">{Math.round(stats.accuracy * 100)}%</strong>
              <span className="small muted">{l.ui('quiz.livePass', { pass: session.passPercent })}</span>
            </p>
            <Meter value={stats.accuracy} label={l.ui('quiz.live')} tone={tone(stats.accuracy)} />
            <p className="small muted">
              {l.ui('quiz.liveAccuracy', { correct: stats.correct, wrong: stats.judged - stats.correct, n: stats.judged })}
            </p>
            {domains.length > 0 && (
              <ul className="live__domains" aria-label={l.ui('quiz.byDomain')}>
                {domains.map(([name, d]) => (
                  <li key={name}>
                    <span className="live__domain" title={name}>{shortDomain(name)}</span>
                    <span className="num small">{d.correct}/{d.total}</span>
                    <Meter value={d.correct / d.total} label={name} tone={tone(d.correct / d.total)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ))}
      {stats.pace !== null && (
        <p className="small live__pace" data-slow={stats.pace > target}>
          {l.ui('quiz.livePace', { pace: Localizer.clock(stats.pace), target: Localizer.clock(target) })}
        </p>
      )}
    </section>
  )
}
