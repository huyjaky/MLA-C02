// Server routes shared by the Vite dev server (vite.config.js) and the production server (index.js).
import sirv from 'sirv'
import path from 'node:path'
import { studyApi } from './StudyApi.js'

/**
 * [prefix, handler] pairs, connect-style: each handler sees req.url with its prefix stripped.
 *   /api       accounts + progress (SQLite at dbFile)
 *   /media     .mp4 videos under courseDir (HTTP Range, so <video> can seek)
 *   /materials lab files under materialsDir
 *   /slides    the slides PDF, downloaded under slidesName
 */
export function courseRoutes({ courseDir, materialsDir, slidesFile, slidesName = path.basename(slidesFile), dbFile }) {
  // dev: true looks files up per request instead of indexing the 11 GB course tree at startup
  const videos = sirv(courseDir, { dev: true })
  const materials = sirv(materialsDir, { dev: true })
  const slides = sirv(path.dirname(slidesFile), { dev: true })
  const urlPath = (req) => decodeURIComponent(req.url.split('?')[0])
  const safe = (req) => !urlPath(req).includes('..')
  const downloadName = `attachment; filename*=UTF-8''${encodeURIComponent(slidesName)}`

  return [
    ['/api', studyApi(dbFile)],
    ['/media', (req, res, next) => (safe(req) && urlPath(req).endsWith('.mp4') ? videos(req, res, next) : next())],
    ['/materials', (req, res, next) => (safe(req) ? materials(req, res, next) : next())],
    ['/slides', (req, res, next) => {
      req.url = encodeURI(`/${path.basename(slidesFile)}`)
      res.setHeader('Content-Disposition', downloadName)
      slides(req, res, next)
    }],
  ]
}
