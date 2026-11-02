import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PlayCircle, RotateCcw, Check, X } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { BiText } from '../components/BiText'
import { SectionTab } from '../components/SectionTab'
import { Segmented } from '../components/Segmented'
import { LeitnerBox } from '../components/LeitnerBox'

const LEAVE_MS = 320 // matches the card's slide-into-box animation

function CardFront({ card }) {
  if (card.kind === 'term') return <span className="flash__term">{card.term.term}</span>
  return <BiText pair={card.question.question} html as="span" className="flash__question" />
}

function CardBack({ card }) {
  const { l } = useApp()
  if (card.kind === 'term') {
    return (
      <>
        <BiText pair={card.term.definition} as="span" className="flash__definition" />
        {card.term.lecture && (
          <Link to={`/lecture/${card.term.lecture}`} className="term__source" onClick={(e) => e.stopPropagation()}>
            <PlayCircle size={14} aria-hidden="true" /> {l.ui('glossary.watch')}
          </Link>
        )}
      </>
    )
  }
  const q = card.question
  return (
    <span className="flash__answers">
      {q.answer.map((i) => (
        <span key={i} className="flash__answer-item">
          <BiText pair={q.options[i]} html as="span" className="flash__answer" />
          {q.feedback?.[i] && <BiText pair={q.feedback[i]} html as="span" className="flash__why" />}
        </span>
      ))}
    </span>
  )
}

export function FlashcardsPage() {
  const { repo, tracker, l } = useApp()
  const [params, setParams] = useSearchParams()
  const section = params.get('section') ?? 'all'
  const kind = params.get('kind') ?? 'term'
  const [flipped, setFlipped] = useState(false)
  const [leaving, setLeaving] = useState(null) // 'known' | 'again' while the card animates out
  const [seen, setSeen] = useState(() => new Set()) // reviewed this round, so a missed card waits its turn
  const [ahead, setAhead] = useState(false)

  const allCards = useMemo(() => repo.flashcards(), [repo])
  const cards = useMemo(
    () => allCards.filter((c) => (section === 'all' || c.section === section) && (kind === 'all' || c.kind === kind)),
    [allCards, section, kind],
  )
  const scheduler = tracker.scheduler
  const pool = ahead ? [...cards].sort((a, b) => scheduler.box(a.id) - scheduler.box(b.id)) : scheduler.queue(cards)
  const queue = pool.filter((c) => !seen.has(c.id))
  const card = queue[0]
  const sections = [...new Set(allCards.filter((c) => kind === 'all' || c.kind === kind).map((c) => c.section))]

  const restart = (studyAhead = false) => {
    setSeen(new Set())
    setAhead(studyAhead)
    setFlipped(false)
  }
  const setFilter = (name, value) => {
    setParams((p) => {
      p.set(name, value)
      return p
    }, { replace: true })
    restart()
  }
  const grade = (known) => {
    if (!card || leaving) return
    setLeaving(known ? 'known' : 'again')
    setTimeout(() => {
      tracker.reviewCard(card.id, known)
      setSeen((s) => new Set(s).add(card.id))
      setLeaving(null)
      setFlipped(false)
    }, LEAVE_MS)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (!card || e.target.closest('input, select, textarea, a') || e.metaKey || e.ctrlKey) return
      if (e.key === ' ') setFlipped((f) => !f)
      else if (flipped && e.key === '1') grade(false)
      else if (flipped && e.key === '2') grade(true)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="page">
      <PageHeader title={l.ui('nav.flashcards')} lead={l.ui('cards.lead')} />

      <div className="toolbar">
        <label className="field">
          <span>{l.ui('cards.section')}</span>
          <select value={section} onChange={(e) => setFilter('section', e.target.value)}>
            <option value="all">{l.ui('cards.allSections')}</option>
            {sections.map((id) => (
              <option key={id} value={id}>
                {id === 'exam' ? l.ui('quizzes.exams') : `${id} - ${l.text(repo.section(id).title)}`}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          label={l.ui('cards.kind')}
          value={kind}
          onChange={(v) => setFilter('kind', v)}
          options={[
            { value: 'term', label: l.ui('cards.terms') },
            { value: 'question', label: l.ui('cards.questions') },
            { value: 'all', label: l.ui('cards.all') },
          ]}
        />
      </div>

      <LeitnerBox counts={scheduler.counts(cards)} active={card ? scheduler.box(card.id) : -1} />

      {card ? (
        <div className="flash-stage">
          <p className="small muted num">{l.ui('cards.left', { n: queue.length })}</p>
          <button
            key={card.id}
            type="button"
            className="flash"
            data-flipped={flipped}
            data-leaving={leaving ?? undefined}
            onClick={() => setFlipped((f) => !f)}
            aria-label={l.ui(flipped ? 'cards.showFront' : 'cards.showBack')}
          >
            <span className="flash__inner">
              <span className="flash__face flash__face--front card-stock ruled" aria-hidden={flipped}>
                <span className="flash__meta">
                  <SectionTab id={card.section} size="sm" /> {l.ui(card.kind === 'term' ? 'cards.term' : 'cards.question')}
                </span>
                <CardFront card={card} />
                <span className="flash__hint small muted">{l.ui('cards.tapToFlip')}</span>
              </span>
              <span className="flash__face flash__face--back card-stock ruled" aria-hidden={!flipped}>
                <span className="flash__meta"><SectionTab id={card.section} size="sm" /> {l.ui('cards.answer')}</span>
                <CardBack card={card} />
              </span>
            </span>
          </button>
          <div className="flash-actions" data-visible={flipped}>
            <button type="button" className="btn btn--again" disabled={!flipped} onClick={() => grade(false)}>
              <X size={16} aria-hidden="true" /> {l.ui('cards.again')} <kbd>1</kbd>
            </button>
            <button type="button" className="btn btn--known" disabled={!flipped} onClick={() => grade(true)}>
              <Check size={16} aria-hidden="true" /> {l.ui('cards.known')} <kbd>2</kbd>
            </button>
          </div>
          <p className="small muted">{l.ui('cards.keys')}</p>
        </div>
      ) : (
        <div className="empty-state card-stock">
          <h2>{pool.length ? l.ui('cards.roundDone') : l.ui('cards.allDone')}</h2>
          <p className="muted">{pool.length ? l.ui('cards.roundHelp', { n: pool.length }) : l.ui('cards.allDoneHelp')}</p>
          <div className="actions">
            {pool.length > 0 ? (
              <button type="button" className="btn btn--primary" onClick={() => restart(ahead)}>
                <RotateCcw size={16} aria-hidden="true" /> {l.ui('cards.newRound')}
              </button>
            ) : (
              cards.length > 0 && (
                <button type="button" className="btn btn--primary" onClick={() => restart(true)}>
                  {l.ui('cards.studyAhead')}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
