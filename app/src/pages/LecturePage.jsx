import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, FileDown, Minus, Play, Plus, X } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { TranscriptTrack } from '../core/TranscriptTrack'
import { Localizer } from '../core/Localizer'
import { BiText } from '../components/BiText'
import { SectionTab } from '../components/SectionTab'
import { Segmented } from '../components/Segmented'
import { VideoPlayer } from '../components/player/VideoPlayer'
import { LectureSummary } from '../components/LectureSummary'
import { NotFoundPage } from './NotFoundPage'

const COMPLETE_AT = 0.9 // a lecture counts as watched after 90% of it played
const DELAY_STEP = 0.25 // seconds per click or G/H key press
const SAVE_EVERY = 5 // seconds of playback between saved positions
// encodeURI, not encodeURIComponent: sirv decodes with decodeURI, which leaves %2C (commas in titles) encoded.
// shortcut: a '#' in a file name would still break; none of the course files has one.
const mediaUrl = (path) => encodeURI(`/media/${path}`)
const materialUrl = (path) => encodeURI(`/materials/${path}`)
// the server answers /slides with SLIDES_FILE and its original file name (Content-Disposition)
const SLIDES_URL = '/slides'

function useTracks(repo, lectureId) {
  const [tracks, setTracks] = useState(null)
  useEffect(() => {
    let live = true
    setTracks(null)
    repo.transcript(lectureId).then((cues) => {
      if (live) setTracks({ en: new TranscriptTrack(cues.en), vi: new TranscriptTrack(cues.vi) })
    })
    return () => { live = false }
  }, [repo, lectureId])
  return tracks
}

export function LecturePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { repo, tracker, l } = useApp()
  const entry = repo.lecture(id)

  useEffect(() => { if (entry) tracker.openLecture(id) }, [id, entry, tracker])
  if (!entry) return <NotFoundPage />

  const { lecture, section, prev, next } = entry
  const done = tracker.isLectureDone(id)

  return (
    <div className="page page--wide">
      <nav className="crumbs" aria-label={l.ui('nav.breadcrumb')}>
        <Link to={`/section/${section.id}`}><SectionTab id={section.id} size="sm" /> <BiText pair={section.title} /></Link>
      </nav>
      <div className="lecture-head">
        <h1><BiText pair={lecture.title} /></h1>
        <button type="button" className="toggle" aria-pressed={done} onClick={() => tracker.completeLecture(id, !done)}>
          <Check size={16} aria-hidden="true" /> {l.ui(done ? 'lecture.done' : 'lecture.markDone')}
        </button>
      </div>

      {lecture.kind === 'note' ? (
        <NoteBody noteId={id} />
      ) : (
        <VideoWithTranscript
          key={id}
          lecture={lecture}
          autoResume={params.has('resume')}
          onComplete={() => !done && tracker.completeLecture(id)}
        />
      )}

      {lecture.kind !== 'note' && <LectureSummary key={id} lectureId={id} />}
      <Materials files={lecture.materials ?? []} />

      <nav className="pager" aria-label={l.ui('lecture.pager')}>
        {prev ? <PagerLink id={prev} dir="prev" /> : <span />}
        {next && <PagerLink id={next} dir="next" />}
      </nav>
    </div>
  )
}

function PagerLink({ id, dir }) {
  const { repo, l } = useApp()
  const { lecture } = repo.lecture(id)
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <Link to={`/lecture/${id}`} className={`pager__link pager__link--${dir}`}>
      {dir === 'prev' && <Icon size={18} aria-hidden="true" />}
      <span>
        <small>{l.ui(`lecture.${dir}`)}</small>
        <BiText pair={lecture.title} />
      </span>
      {dir === 'next' && <Icon size={18} aria-hidden="true" />}
    </Link>
  )
}

/** Downloads under the lecture: the course slides, then any files from MLA-C02-Materials it uses. */
function Materials({ files }) {
  const { repo, l } = useApp()
  const link = (href, label, folder = '') => (
    <li key={href}>
      <a href={href} download className="material">
        <FileDown size={16} aria-hidden="true" />
        <span className="material__name">{label}</span>
        <span className="material__path muted small">{folder}</span>
      </a>
    </li>
  )
  return (
    <section className="materials card-stock" aria-labelledby="materials-h">
      <h2 id="materials-h">{l.ui('lecture.materials')}</h2>
      <ul className="materials__list">
        {link(SLIDES_URL, l.text(repo.slides.title))}
        {files.map((path) => link(materialUrl(path), path.split('/').pop(), path.split('/').slice(0, -1).join('/')))}
      </ul>
    </section>
  )
}

function NoteBody({ noteId }) {
  const { repo } = useApp()
  const note = repo.notes.find((n) => n.id === noteId)
  return note ? <article className="prose card-stock"><BiText pair={note.body} html /></article> : null
}

function VideoWithTranscript({ lecture, autoResume, onComplete }) {
  const { repo, tracker, state, l } = useApp()
  const video = useRef(null)
  const list = useRef(null)
  const tracks = useTracks(repo, lecture.id)
  const [time, setTime] = useState(0)
  const captions = state.settings.captions ?? 'both' // 'off' | 'en' | 'vi' | 'both', remembered across lectures
  const [lang, setLang] = useState(l.lang)
  const [follow, setFollow] = useState(true)
  const [videoError, setVideoError] = useState(false)
  const [resumeAt] = useState(() => tracker.resumePoint(lecture.id)) // captured on open so it does not move while watching
  const [offerResume, setOfferResume] = useState(Boolean(resumeAt))
  const lastSaved = useRef(0)

  // Subtitle delay per lecture: + shows subtitles later, - earlier. Cues are looked up at the shifted time.
  const delay = tracker.subDelay(lecture.id)
  const subTime = time - delay
  const nudge = (step) => tracker.setSubDelay(lecture.id, step ? delay + step : 0)

  const track = tracks?.[lang]
  const active = track ? track.indexAt(subTime) : -1
  const captionLines = useMemo(() => {
    if (!tracks || captions === 'off') return []
    const langs = captions === 'both' ? [l.lang, l.other] : [captions]
    return langs.map((lg) => ({ lang: lg, text: tracks[lg].textAt(subTime) })).filter((c) => c.text)
  }, [tracks, captions, subTime, l])

  useEffect(() => {
    const row = list.current?.querySelector(`[data-index="${active}"]`)
    if (!follow || !row) return
    list.current.scrollTo({ top: row.offsetTop - list.current.clientHeight / 3, behavior: 'smooth' })
  }, [active, follow])

  // VLC-style keys: G = subtitles earlier, H = subtitles later.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      const step = { g: -DELAY_STEP, h: DELAY_STEP }[e.key.toLowerCase()]
      if (step) nudge(step)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const playFrom = (seconds) => {
    video.current.currentTime = Math.max(0, seconds)
    video.current.play().catch(() => {}) // autoplay may be refused; the user can still press play
    setOfferResume(false)
  }

  // ?resume=1 (the Continue buttons) jumps straight to the saved spot; leaving the page saves the final spot.
  useEffect(() => {
    const el = video.current
    if (!el) return
    if (autoResume && resumeAt) {
      if (el.readyState >= 1) playFrom(resumeAt.t)
      else el.addEventListener('loadedmetadata', () => playFrom(resumeAt.t), { once: true })
    }
    return () => {
      if (el.currentTime > 0 && el.duration) tracker.savePosition(lecture.id, el.currentTime, el.duration)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onTime = (e) => {
    const v = e.currentTarget
    setTime(v.currentTime)
    if (v.duration && v.currentTime / v.duration >= COMPLETE_AT) onComplete()
    if (v.duration && Math.abs(v.currentTime - lastSaved.current) >= SAVE_EVERY) {
      lastSaved.current = v.currentTime
      tracker.savePosition(lecture.id, v.currentTime, v.duration)
    }
    if (offerResume && !v.paused) setOfferResume(false)
  }

  return (
    <div className="player">
      {lecture.video && !videoError ? (
        <VideoPlayer
          src={mediaUrl(lecture.video)}
          videoRef={video}
          captions={captionLines}
          onTime={onTime}
          onError={() => setVideoError(true)}
          overlay={
            offerResume && (
              <div className="resume">
                <button type="button" className="resume__go" onClick={() => playFrom(resumeAt.t)}>
                  <Play size={16} aria-hidden="true" />
                  {l.ui('lecture.resumeFrom', { time: Localizer.clock(resumeAt.t) })}
                </button>
                <button type="button" className="resume__close" onClick={() => setOfferResume(false)} title={l.ui('lecture.resumeDismiss')}>
                  <X size={14} aria-hidden="true" />
                  <span className="sr-only">{l.ui('lecture.resumeDismiss')}</span>
                </button>
              </div>
            )
          }
          extraControls={
            <>
              <Segmented
                label={l.ui('lecture.captions')}
                value={captions}
                onChange={(v) => tracker.setSetting('captions', v)}
                options={[
                  { value: 'off', label: l.ui('lecture.capOff') },
                  { value: 'vi', label: 'VI' },
                  { value: 'en', label: 'EN' },
                  { value: 'both', label: l.ui('lecture.capBoth') },
                ]}
              />
              <div className="delay" role="group" aria-label={l.ui('lecture.delay')}>
                <button type="button" className="vp-btn" onClick={() => nudge(-DELAY_STEP)} title={l.ui('lecture.delayEarlier')}>
                  <Minus size={14} aria-hidden="true" />
                  <span className="sr-only">{l.ui('lecture.delayEarlier')}</span>
                </button>
                <button type="button" className="delay__value num" onClick={() => nudge(0)} title={l.ui('lecture.delayReset')} aria-live="polite">
                  {delay > 0 ? '+' : ''}{delay.toFixed(2)}s
                </button>
                <button type="button" className="vp-btn" onClick={() => nudge(DELAY_STEP)} title={l.ui('lecture.delayLater')}>
                  <Plus size={14} aria-hidden="true" />
                  <span className="sr-only">{l.ui('lecture.delayLater')}</span>
                </button>
              </div>
            </>
          }
        />
      ) : (
        <div className="player__stage">
          <p className="player__missing">{l.ui('lecture.noVideo')}</p>
        </div>
      )}

      <aside className="transcript card-stock" aria-label={l.ui('lecture.transcript')}>
        <div className="transcript__bar">
          <Segmented
            label={l.ui('lecture.transcriptLang')}
            value={lang}
            onChange={setLang}
            options={Localizer.LANGS.map((lg) => ({ value: lg, label: lg.toUpperCase() }))}
          />
          <label className="check">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            {l.ui('lecture.follow')}
          </label>
        </div>
        {!tracks ? (
          <ol className="transcript__list" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => <li key={i} className="skeleton" />)}
          </ol>
        ) : track.isEmpty ? (
          <p className="empty">{l.ui('lecture.noTranscript')}</p>
        ) : (
          <ol className="transcript__list" ref={list} lang={lang}>
            {track.cues.map(([start, , text], i) => (
              <li key={i} data-index={i}>
                <button type="button" className="cue" aria-current={i === active || undefined} onClick={() => playFrom(start + delay)}>
                  <span className="cue__time num">{Localizer.clock(start)}</span>
                  <span className="cue__text">{text}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  )
}
