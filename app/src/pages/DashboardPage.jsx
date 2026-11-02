import { Link } from 'react-router-dom'
import { ArrowRight, Layers, PlayCircle, RotateCcw } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { SectionTab } from '../components/SectionTab'
import { Meter } from '../components/Meter'
import { LeitnerBox } from '../components/LeitnerBox'
import { Localizer } from '../core/Localizer'

function TodayLink({ to, icon: Icon, label, value, children, primary = false }) {
  return (
    <Link to={to} className={`today__item ${primary ? 'today__item--primary' : ''}`}>
      <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {children}
      </span>
      <ArrowRight size={18} className="today__go" aria-hidden="true" />
    </Link>
  )
}

export function DashboardPage() {
  const { repo, tracker, state, l } = useApp()
  const cards = repo.flashcards()
  const scheduler = tracker.scheduler
  const resume = repo.lecture(state.lastLecture ?? repo.studySections[0].lectures[0].id)
  const resumeAt = tracker.resumePoint(resume.lecture.id)
  const mistakes = tracker.mistakeIds.length
  const exams = repo.quizzes.filter((q) => q.kind === 'exam')

  return (
    <div className="page">
      <PageHeader
        title={l.ui('dash.title')}
        lead={l.ui('dash.lead', { done: Object.keys(state.lectures).length, total: repo.lectureCount })}
      />

      <section className="today" aria-label={l.ui('dash.today')}>
        <TodayLink
          primary
          to={`/lecture/${resume.lecture.id}?resume=1`}
          icon={PlayCircle}
          label={state.lastLecture ? l.ui('dash.resume') : l.ui('dash.start')}
          value={<BiText pair={resume.lecture.title} />}
        >
          {resumeAt && (
            <span className="today__progress">
              <Meter value={resumeAt.t / resumeAt.d} label={l.ui('dash.resume')} />
              <span className="num">{Localizer.clock(resumeAt.t)} / {Localizer.clock(resumeAt.d)}</span>
            </span>
          )}
        </TodayLink>
        <TodayLink to="/flashcards" icon={Layers} label={l.ui('nav.flashcards')} value={l.ui('dash.due', { n: scheduler.queue(cards).length })} />
        <TodayLink
          to={mistakes ? '/quiz/mistakes' : '/quizzes'}
          icon={RotateCcw}
          label={l.ui('quiz.mistakes')}
          value={l.ui('dash.mistakes', { n: mistakes })}
        />
      </section>

      <div className="dash-grid">
        <section className="panel" aria-labelledby="sections-h">
          <h2 id="sections-h">{l.ui('dash.sections')}</h2>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{l.ui('dash.colSection')}</th>
                <th scope="col">{l.ui('dash.colLectures')}</th>
                <th scope="col" className="num">{l.ui('dash.colQuiz')}</th>
              </tr>
            </thead>
            <tbody>
              {repo.studySections.map((s) => {
                const p = tracker.sectionProgress(s)
                const quiz = repo.quizzesFor(s.id)[0]
                const best = quiz ? tracker.quizStats(quiz.id)?.best : undefined
                return (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/section/${s.id}`} className="table__title">
                        <SectionTab id={s.id} size="sm" />
                        <BiText pair={s.title} />
                      </Link>
                    </td>
                    <td>
                      <span className="progress-cell">
                        <Meter value={p.ratio} label={l.ui('dash.colLectures')} />
                        <span className="num">{p.done}/{p.total}</span>
                      </span>
                    </td>
                    <td className="num">
                      {!quiz ? <span className="muted">-</span> : best == null ? <span className="muted">{l.ui('dash.notTaken')}</span> : `${best}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <div className="dash-side">
          <section className="panel" aria-labelledby="exam-h">
            <h2 id="exam-h">{l.ui('dash.exams')}</h2>
            <ul className="exam-list">
              {exams.map((exam) => {
                const best = tracker.quizStats(exam.id)?.best
                const passed = best >= exam.passPercent
                return (
                  <li key={exam.id}>
                    <Link to={`/quiz/${exam.id}?mode=exam`} className="exam-list__row">
                      <span>
                        <strong>{l.ui('quiz.questionsN', { n: exam.questions.length })}</strong>
                        <small>{l.ui('quiz.pass', { n: exam.passPercent })}</small>
                      </span>
                      <span className={`score ${best == null ? '' : passed ? 'score--pass' : 'score--fail'}`}>
                        {best == null ? '-' : `${best}%`}
                      </span>
                    </Link>
                    <Meter value={(best ?? 0) / 100} label={l.ui('quiz.best')} tone={passed ? 'ok' : 'ink'} />
                  </li>
                )
              })}
            </ul>
          </section>
          <section className="panel" aria-labelledby="box-h">
            <h2 id="box-h">{l.ui('cards.box')}</h2>
            <LeitnerBox counts={scheduler.counts(cards)} />
            <p className="muted small">{l.ui('cards.boxHelp')}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
