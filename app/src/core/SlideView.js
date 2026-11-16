const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/**
 * Where the reader is in a stack of equally tall slide pages, independent of zoom and window width:
 * `page` (0-based) at the reading line and `frac`, the share of that page already scrolled past.
 * `stride` is one page's height plus the gap below it.
 */
export const SlideView = {
  ZOOMS: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  DEFAULT_ZOOM: 0.8,

  /** Position of offset `y` (pixels from the top of the first page). */
  locate(y, stride, count) {
    if (!(stride > 0) || count < 1) return { page: 0, frac: 0 }
    const page = clamp(Math.floor(y / stride), 0, count - 1)
    const frac = clamp((y - page * stride) / stride, 0, 1)
    return { page, frac: Math.round(frac * 1000) / 1000 }
  },

  /** Pixel offset of a saved position at the current stride; the inverse of locate. */
  offset(position, stride, count) {
    if (!position || !(stride > 0) || count < 1) return 0
    const page = clamp(Math.floor(position.page) || 0, 0, count - 1)
    return (page + clamp(Number(position.frac) || 0, 0, 1)) * stride
  },

  /** Nearest allowed zoom: saved progress may hold anything. */
  zoom(value) {
    const z = Number(value)
    if (!Number.isFinite(z)) return SlideView.DEFAULT_ZOOM
    return SlideView.ZOOMS.reduce((best, step) => (Math.abs(step - z) < Math.abs(best - z) ? step : best))
  },
}
