import { useEffect, useRef, useState } from 'react'
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react'
import { useApp } from '../../state/AppContext'
import { Localizer } from '../../core/Localizer'
import { CueText } from './CueText'

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
const IDLE_MS = 2500 // controls fade out after this long without pointer movement while playing
const SEEK_STEP = 5
const JUMP_STEP = 10

/**
 * Video with its own control bar: seek bar, play, ±10s, volume, time, speed and fullscreen.
 * The whole stage goes fullscreen, so captions and `extraControls` (caption picker, delay) come along.
 * Keys: Space/K play · ←/→ 5s · J/L 10s · M mute · F fullscreen.
 */
export function VideoPlayer({ src, videoRef, captions = [], extraControls, overlay, onTime, onError }) {
  const { tracker, state, l } = useApp()
  const stage = useRef(null)
  const idleTimer = useRef(0)
  const [media, setMedia] = useState({ time: 0, duration: 0, buffered: 0, paused: true, muted: false, volume: 1 })
  const [fullscreen, setFullscreen] = useState(false)
  const [idle, setIdle] = useState(false)
  const [hover, setHover] = useState(null) // { ratio, time } under the pointer on the seek bar
  const rate = state.settings.playbackRate ?? 1
  const chromeHidden = idle && !media.paused

  const video = () => videoRef.current
  const read = () => {
    const v = video()
    const end = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0
    setMedia({ time: v.currentTime, duration: v.duration || 0, buffered: end, paused: v.paused, muted: v.muted, volume: v.volume })
  }
  const togglePlay = () => (video().paused ? video().play() : video().pause())
  const seekTo = (t) => (video().currentTime = Math.min(Math.max(t, 0), media.duration || t))
  const seekBy = (d) => seekTo(video().currentTime + d)
  // volume and mute are account settings, so every lecture opens the way the learner left them
  const toggleMute = () => {
    video().muted = !video().muted
    tracker.setSetting('muted', video().muted)
  }
  const setVolume = (value) => {
    video().volume = value
    video().muted = value === 0
    tracker.setSetting('volume', value)
    tracker.setSetting('muted', value === 0)
  }
  const toggleFullscreen = () =>
    document.fullscreenElement ? document.exitFullscreen() : stage.current.requestFullscreen().catch(() => {})

  useEffect(() => {
    video().volume = state.settings.volume ?? 1
    video().muted = state.settings.muted ?? false
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (video()) video().playbackRate = video().defaultPlaybackRate = rate
  }, [rate, videoRef])

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      clearTimeout(idleTimer.current)
    }
  }, [])

  useEffect(() => {
    const actions = {
      ' ': togglePlay, k: togglePlay, m: toggleMute, f: toggleFullscreen,
      arrowleft: () => seekBy(-SEEK_STEP), arrowright: () => seekBy(SEEK_STEP),
      j: () => seekBy(-JUMP_STEP), l: () => seekBy(JUMP_STEP),
    }
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, select, textarea, button, a')) return
      const action = actions[e.key.toLowerCase()]
      if (!action || !video()) return
      e.preventDefault()
      action()
      wake()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const wake = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS)
  }
  const pointAt = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1)
    setHover({ ratio, time: ratio * media.duration })
  }
  const pct = (t) => (media.duration ? t / media.duration : 0)
  const clock = Localizer.clock

  return (
    <div
      className="player__stage"
      ref={stage}
      data-chrome={chromeHidden ? 'hidden' : 'shown'}
      onPointerMove={wake}
      onPointerLeave={() => setIdle(true)}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onLoadedMetadata={read}
        onProgress={read}
        onPlay={() => {
          read()
          wake() // start the hide countdown even if playback began from the keyboard
        }}
        onPause={read}
        onVolumeChange={read}
        onTimeUpdate={(e) => {
          read()
          onTime(e)
        }}
        onError={onError}
      />
      {overlay}

      {/* captions sit directly above the bar and slide down as the bar collapses */}
      <div className="vp-bottom">
      {captions.length > 0 && (
        <div className="captions" aria-live="off">
          {captions.map((c, i) => (
            <p key={c.lang} lang={c.lang} className={`captions__line captions__line--${i === 0 ? 'primary' : 'secondary'}`}>
              <CueText text={c.text} />
            </p>
          ))}
        </div>
      )}

      <div className="vp-controls">
        <div className="vp-controls__inner">
        <div
          className="seek"
          style={{ '--played': pct(media.time), '--buffered': pct(media.buffered) }}
          onPointerMove={pointAt}
          onPointerLeave={() => setHover(null)}
        >
          <span className="seek__track" aria-hidden="true">
            <span className="seek__buffered" />
            <span className="seek__played" />
          </span>
          {hover && (
            <span className="seek__tip num" style={{ left: `${hover.ratio * 100}%` }} aria-hidden="true">
              {clock(hover.time)}
            </span>
          )}
          <input
            type="range"
            className="seek__input"
            min={0}
            max={media.duration || 0}
            step={0.1}
            value={media.time}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label={l.ui('player.seek')}
            aria-valuetext={`${clock(media.time)} / ${clock(media.duration)}`}
          />
        </div>

        <div className="vp-row">
          <div className="vp-group">
          <button type="button" className="vp-btn vp-btn--play" onClick={togglePlay} title={l.ui(media.paused ? 'player.play' : 'player.pause')}>
            {media.paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
            <span className="sr-only">{l.ui(media.paused ? 'player.play' : 'player.pause')}</span>
          </button>
          <button type="button" className="vp-btn" onClick={() => seekBy(-JUMP_STEP)} title={l.ui('player.back')}>
            <RotateCcw size={16} aria-hidden="true" />
            <span className="sr-only">{l.ui('player.back')}</span>
          </button>
          <button type="button" className="vp-btn" onClick={() => seekBy(JUMP_STEP)} title={l.ui('player.forward')}>
            <RotateCw size={16} aria-hidden="true" />
            <span className="sr-only">{l.ui('player.forward')}</span>
          </button>
          <div className="vp-volume">
            <button type="button" className="vp-btn" onClick={toggleMute} title={l.ui(media.muted ? 'player.unmute' : 'player.mute')}>
              {media.muted || media.volume === 0 ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
              <span className="sr-only">{l.ui(media.muted ? 'player.unmute' : 'player.mute')}</span>
            </button>
            <input
              type="range"
              className="vp-volume__input"
              min={0}
              max={1}
              step={0.05}
              value={media.muted ? 0 : media.volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              style={{ '--level': media.muted ? 0 : media.volume }}
              aria-label={l.ui('player.volume')}
            />
          </div>
          <span className="vp-time num">
            {clock(media.time)} <span className="vp-time__total">/ {clock(media.duration)}</span>
          </span>
          </div>

          <div className="vp-group vp-group--end">
          {extraControls}
          <label className="vp-rate" title={l.ui('player.speed')}>
            <span className="sr-only">{l.ui('player.speed')}</span>
            <select value={rate} onChange={(e) => tracker.setSetting('playbackRate', Number(e.target.value))}>
              {RATES.map((r) => (
                <option key={r} value={r}>{r}×</option>
              ))}
            </select>
          </label>
          <button type="button" className="vp-btn" onClick={toggleFullscreen} title={l.ui(fullscreen ? 'lecture.exitFullscreen' : 'lecture.fullscreen')}>
            {fullscreen ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
            <span className="sr-only">{l.ui(fullscreen ? 'lecture.exitFullscreen' : 'lecture.fullscreen')}</span>
          </button>
          </div>
        </div>
        </div>
      </div>
      </div>
    </div>
  )
}
