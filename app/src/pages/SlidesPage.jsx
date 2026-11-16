import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ChevronDown, ChevronUp, FileDown, Minus, Plus } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'
import { SlideView } from '../core/SlideView'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// the server answers /slides with SLIDES_FILE (HTTP Range, so pdf.js fetches only the pages it shows)
const SLIDES_URL = '/slides'
const GAP = 16 // px between pages; the same as .slides__stack's gap
const NEAR = '150% 0px' // pages this close to the screen are drawn, so scrolling meets finished pages
const SAVE_IDLE_MS = 400 // save the spot once scrolling pauses

/** The course slides drawn in the page, reopening where this account left off (page, offset in it, zoom). */
export function SlidesPage() {
  const { tracker, repo, l } = useApp()
  const [pdf, setPdf] = useState(null) // { doc, count, ratio: height / width of page 1 }
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(() => SlideView.zoom(tracker.get().slides?.zoom))
  const [width, setWidth] = useState(0)
  const [current, setCurrent] = useState(() => tracker.get().slides?.page ?? 0)
  const [visible, setVisible] = useState(() => new Set())
  const box = useRef(null)
  const stack = useRef(null)
  const bar = useRef(null)
  const anchor = useRef(tracker.get().slides) // spot held through loading, zoom and resize
  const ready = useRef(false) // until the saved spot is restored, scroll events must not overwrite it
  const zoomRef = useRef(zoom) // read by the deferred save, which may run after a zoom change
  zoomRef.current = zoom

  const pageWidth = Math.floor(width * zoom)
  const pageHeight = pdf ? Math.round(pageWidth * pdf.ratio) : 0
  const stride = pageHeight + GAP

  useEffect(() => {
    let alive = true
    const task = pdfjs.getDocument({ url: SLIDES_URL })
    task.promise
      .then(async (doc) => {
        const { width: w, height: h } = (await doc.getPage(1)).getViewport({ scale: 1 })
        if (alive) setPdf({ doc, count: doc.numPages, ratio: h / w })
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      task.destroy()
    }
  }, [])

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [])

  // Offsets in document pixels: the top of page 1, and the reading line just under the sticky toolbar.
  const stackTop = () => stack.current.getBoundingClientRect().top + window.scrollY
  const readLine = () => (bar.current ? parseFloat(getComputedStyle(bar.current).top) + bar.current.offsetHeight : 0)

  const scrollToSpot = useCallback(
    (spot) => {
      const y = stackTop() + SlideView.offset(spot, stride, pdf.count) - readLine()
      window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: 'instant' })
    },
    [stride, pdf],
  )

  // First layout, zoom or resize: put the remembered spot back under the toolbar.
  useLayoutEffect(() => {
    if (!pdf || !pageWidth) return
    if (anchor.current) scrollToSpot(anchor.current)
    ready.current = true
  }, [pdf, pageWidth, scrollToSpot])

  useEffect(() => {
    if (!pdf || !pageWidth) return
    let frame = 0
    let timer = 0
    const save = () => {
      timer = 0
      if (anchor.current) tracker.setSlidesView({ ...anchor.current, zoom: zoomRef.current })
    }
    const onScroll = () => {
      if (!ready.current || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        anchor.current = SlideView.locate(window.scrollY + readLine() - stackTop(), stride, pdf.count)
        setCurrent(anchor.current.page)
        clearTimeout(timer)
        timer = setTimeout(save, SAVE_IDLE_MS)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      if (timer) {
        clearTimeout(timer)
        save() // leaving the page mid-pause still keeps the spot
      }
    }
  }, [pdf, pageWidth, stride, tracker])

  // Which pages are on or near the screen; only those hold a drawn canvas.
  useEffect(() => {
    if (!pdf) return
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev)
          for (const e of entries) e.isIntersecting ? next.add(Number(e.target.dataset.index)) : next.delete(Number(e.target.dataset.index))
          return next
        }),
      { rootMargin: NEAR },
    )
    stack.current.querySelectorAll('[data-index]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [pdf])

  const goTo = (page) => {
    if (!pdf) return
    const spot = { page: Math.min(Math.max(page, 0), pdf.count - 1), frac: 0 }
    anchor.current = spot
    setCurrent(spot.page)
    scrollToSpot(spot)
    tracker.setSlidesView({ ...spot, zoom })
  }

  const changeZoom = (step) => {
    const zooms = SlideView.ZOOMS
    const next = zooms[Math.min(Math.max(zooms.indexOf(zoom) + step, 0), zooms.length - 1)]
    if (next === zoom) return
    setZoom(next)
    tracker.setSlidesView({ ...(anchor.current ?? { page: 0, frac: 0 }), zoom: next })
  }

  const download = (
    <a href={SLIDES_URL} download className="btn btn--ghost btn--sm">
      <FileDown size={16} aria-hidden="true" /> {l.ui('slides.download')}
    </a>
  )

  return (
    <div className="page page--wide slides">
      <PageHeader title={l.text(repo.slides.title)} lead={l.ui('slides.lead')} />

      {pdf && (
        <div className="slides__bar" ref={bar} role="toolbar" aria-label={l.ui('slides.toolbar')}>
          <button type="button" className="icon-btn" onClick={() => goTo(current - 1)} disabled={current === 0} title={l.ui('slides.prev')} aria-label={l.ui('slides.prev')}>
            <ChevronUp size={18} aria-hidden="true" />
          </button>
          <label className="slides__goto">
            {l.ui('slides.page')}
            <input
              key={current}
              type="number"
              min={1}
              max={pdf.count}
              defaultValue={current + 1}
              onKeyDown={(e) => e.key === 'Enter' && goTo(Number(e.currentTarget.value) - 1)}
              onBlur={(e) => Number(e.currentTarget.value) - 1 !== current && goTo(Number(e.currentTarget.value) - 1)}
            />
            <span>/ {pdf.count}</span>
          </label>
          <button type="button" className="icon-btn" onClick={() => goTo(current + 1)} disabled={current >= pdf.count - 1} title={l.ui('slides.next')} aria-label={l.ui('slides.next')}>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <span className="slides__sep" aria-hidden="true" />
          <button type="button" className="icon-btn" onClick={() => changeZoom(-1)} disabled={zoom === SlideView.ZOOMS[0]} title={l.ui('slides.zoomOut')} aria-label={l.ui('slides.zoomOut')}>
            <Minus size={16} aria-hidden="true" />
          </button>
          <span className="slides__zoom" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn" onClick={() => changeZoom(1)} disabled={zoom === SlideView.ZOOMS.at(-1)} title={l.ui('slides.zoomIn')} aria-label={l.ui('slides.zoomIn')}>
            <Plus size={16} aria-hidden="true" />
          </button>
          <span className="slides__sep" aria-hidden="true" />
          {download}
        </div>
      )}

      <div ref={box} className="slides__box">
        {failed ? (
          <div className="slides__status card-stock">
            <p>{l.ui('slides.error')}</p>
            {download}
          </div>
        ) : !pdf ? (
          <p className="slides__status muted">{l.ui('slides.loading')}</p>
        ) : (
          <div ref={stack} className="slides__stack">
            {Array.from({ length: pdf.count }, (_, i) => (
              <Slide key={i} doc={pdf.doc} index={i} width={pageWidth} height={pageHeight} show={visible.has(i)} label={l.ui('slides.pageLabel', { n: i + 1 })} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** One page: an empty box of the right size until it nears the screen, then drawn sharp for this display. */
const Slide = memo(function Slide({ doc, index, width, height, show, label }) {
  const canvas = useRef(null)

  useEffect(() => {
    const el = canvas.current
    if (!show || !width) {
      el.width = 0 // frees the bitmap of pages far from the screen
      el.height = 0
      return
    }
    let alive = true
    let task
    doc.getPage(index + 1).then((page) => {
      if (!alive) return
      const scale = (width / page.getViewport({ scale: 1 }).width) * (window.devicePixelRatio || 1)
      const viewport = page.getViewport({ scale })
      el.width = Math.floor(viewport.width)
      el.height = Math.floor(viewport.height)
      task = page.render({ canvasContext: el.getContext('2d'), viewport })
      task.promise.catch(() => {}) // cancelled when the page scrolls away or the zoom changes
    })
    return () => {
      alive = false
      task?.cancel()
    }
  }, [doc, index, width, show])

  return (
    <div className="slides__page" data-index={index} style={{ width, height }}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  )
})
