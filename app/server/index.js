// Production server: the built app (dist/) plus the course routes. Configured by environment variables
// (set by docker-compose.yml): COURSE_DIR, MATERIALS_DIR, SLIDES_FILE, DB_FILE, optional SLIDES_NAME and PORT.
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { courseRoutes } from './courseRoutes.js'

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`[study] ${name} is not set`)
    process.exit(1)
  }
  return path.resolve(value)
}

const routes = [
  ...courseRoutes({
    courseDir: required('COURSE_DIR'),
    materialsDir: required('MATERIALS_DIR'),
    slidesFile: required('SLIDES_FILE'),
    // the slides are mounted under a fixed name; SLIDES_NAME keeps the original file name for downloads
    slidesName: process.env.SLIDES_NAME?.split(/[\\/]/).pop() || undefined,
    dbFile: required('DB_FILE'),
  }),
  ['/', sirv(fileURLToPath(new URL('../dist', import.meta.url)), { etag: true })],
]

/** Tries each route whose prefix matches, stripping the prefix like connect does. */
function handle(req, res) {
  const original = req.url
  const next = (i) => {
    if (i >= routes.length) {
      res.statusCode = 404
      return res.end('Not found')
    }
    const [prefix, route] = routes[i]
    const matches = prefix === '/' || original === prefix || original.startsWith(`${prefix}/`) || original.startsWith(`${prefix}?`)
    if (!matches) return next(i + 1)
    req.url = prefix === '/' ? original : original.slice(prefix.length) || '/'
    route(req, res, () => {
      req.url = original
      next(i + 1)
    })
  }
  next(0)
}

const port = Number(process.env.PORT ?? 8080)
http.createServer(handle).listen(port, () => console.log(`[study] listening on http://0.0.0.0:${port}`))
