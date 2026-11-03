import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardCheck, Dumbbell, Flag, Layers } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { LectureRow } from '../components/LectureRow'
import { StudyPlanner } from '../core/StudyPlanner'

const DEFAULT_WEEKS = 6
const DAY_FORMAT = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }

/** Pick a start and exam date; lectures are laid out day by day, then a week of practice exams. */
export function SchedulePage() {
  const { repo, tracker, state, l } = useApp()
  const today = StudyPlanner.today()
  const { start, exam } = state.schedule ?? { start: today, exam: StudyPlanner.addDays(today, DEFAULT_WEEKS * 7) }
  const lectures = useMemo(() => repo.studySections.flatMap((s) => s.lectures), [repo])
  // shortest exam first, the full-length mock last
  const exams = useMemo(() => [...repo.exams].sort((a, b) => a.questions.length - b.questions.length), [repo])
  const plan = useMemo(() => StudyPlanner.plan(lectures, start, exam, exams), [lectures, start, exam, exams])
  const todayRef = useRef(null)
  // which days are expanded and the lecture last opened from here, so coming back lands on the same spot
  const view = state.planView ?? { open: [today] }
  const open = new Set(view.open)
  const remember = (patch) => tracker.setPlanView({ ...view, ...patch })
  const toggle = (date, isOpen) => {
    if (isOpen === open.has(date)) return
    remember({ open: isOpen ? [...open, date] : view.open.filter((d) => d !== date) })
  }

  useEffect(() => {
    // next tick: the Shell scrolls every new route to the top after this effect runs
    const timer = setTimeout(() => {
      const last = view.lecture && document.getElementById(`plan-${view.lecture}`)
      const target = last?.closest('details')?.open ? last : todayRef.current
      target?.scrollIntoView({ block: 'center' })
    })
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dateLabel = (date) => l.date(StudyPlanner.toMs(date), DAY_FORMAT)
  const dayHead = (date) => (
    <>
      <span className="plan-day__date">{dateLabel(date)}</span>
      {date === today && <span className="plan-day__tag">{l.ui('plan.today')}</span>}
    </>
  )
  const setDate = (name, value) => value && tracker.setSchedule({ start, exam, [name]: value })
  const late = plan.study?.filter((d) => d.date < today).flatMap((d) => d.lectures).filter((x) => !tracker.isLectureDone(x.id)).length

  const dayProps = (date) => ({
    className: 'plan-day',
    'data-today': date === today,
    open: open.has(date),
    onToggle: (e) => toggle(date, e.currentTarget.open),
    ref: date === today ? todayRef : undefined,
  })

  return (
    <div className="page page--narrow">
      <PageHeader title={l.ui('nav.schedule')} lead={l.ui('plan.lead')} />

      <div className="toolbar">
        <label className="field">
          <span>{l.ui('plan.start')}</span>
          <input type="date" value={start} onChange={(e) => setDate('start', e.target.value)} />
        </label>
        <label className="field">
          <span>{l.ui('plan.exam')}</span>
          <input type="date" value={exam} min={StudyPlanner.addDays(start, StudyPlanner.REVIEW_DAYS + 1)} onChange={(e) => setDate('exam', e.target.value)} />
        </label>
      </div>

      {plan.error ? (
        <p className="plan-alert" role="alert">{l.ui(`plan.${plan.error}`)}</p>
      ) : (
        <>
          <p className="muted">
            {l.ui('plan.summary', {
              days: plan.study.length,
              minutes: Math.round(plan.study.reduce((sum, d) => sum + d.minutes, 0) / plan.study.length),
              review: dateLabel(plan.review[0].date),
            })}
          </p>
          {late > 0 && <p className="plan-alert" role="status">{l.ui('plan.late', { n: late })}</p>}

          <section aria-labelledby="plan-study-h" className="plan">
            <h2 id="plan-study-h">{l.ui('plan.studyH')}</h2>
            {plan.study.map((day, i) => {
              const done = day.lectures.every((x) => tracker.isLectureDone(x.id))
              return (
                <details key={day.date} {...dayProps(day.date)}>
                  <summary>
                    {dayHead(day.date)}
                    <span className="plan-day__meta muted small">
                      {l.ui('plan.dayMeta', { n: i + 1, lectures: day.lectures.length, minutes: Math.round(day.minutes) })}
                    </span>
                    {done && day.lectures.length > 0 && <Check size={16} className="lecture-row__done" aria-label={l.ui('lecture.done')} />}
                  </summary>
                  {day.lectures.length > 0 ? (
                    <ol className="lecture-list">
                      {day.lectures.map((lecture) => (
                        <li key={lecture.id} id={`plan-${lecture.id}`} onClick={() => remember({ lecture: lecture.id })}><LectureRow lecture={lecture} num={lecture.id} /></li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted small plan-day__empty">{l.ui('plan.free')}</p>
                  )}
                </details>
              )
            })}
          </section>

          <section aria-labelledby="plan-review-h" className="plan">
            <h2 id="plan-review-h">{l.ui('plan.reviewH')}</h2>
            {plan.review.map((day) => (
              <details key={day.date} {...dayProps(day.date)}>
                <summary>
                  {dayHead(day.date)}
                  <span className="plan-day__meta muted small">
                    {day.exams.length ? day.exams.map((q) => l.text(q.title)).join(' · ') : l.ui('plan.reviewTodo')}
                  </span>
                </summary>
                <div className="plan-day__actions">
                  {day.exams.map((q) => (
                    <Link key={q.id} to={`/quiz/${q.id}`} className="btn btn--primary">
                      <ClipboardCheck size={16} aria-hidden="true" /> <BiText pair={q.title} />
                    </Link>
                  ))}
                  <Link to="/mistakes" className="btn"><Dumbbell size={16} aria-hidden="true" /> {l.ui('mistakes.title')}</Link>
                  <Link to="/flashcards" className="btn"><Layers size={16} aria-hidden="true" /> {l.ui('nav.flashcards')}</Link>
                </div>
              </details>
            ))}
            <div className="plan-day plan-day--exam" data-today={plan.examDate === today} ref={plan.examDate === today ? todayRef : undefined}>
              <Flag size={16} aria-hidden="true" />
              <span className="plan-day__date">{dateLabel(plan.examDate)}</span>
              <strong>{l.ui('plan.examDay')}</strong>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
