import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { courseRoutes } from './server/courseRoutes.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Course locations from the repo-root .env, resolved against the repo root. */
function coursePaths(mode) {
  const env = loadEnv(mode, REPO_ROOT, '')
  const resolve = (key) => {
    if (!env[key]) throw new Error(`${key} is not set: copy .env.example to .env at the repo root`)
    return path.resolve(REPO_ROOT, env[key])
  }
  return {
    courseDir: resolve('COURSE_DIR'),
    materialsDir: resolve('MATERIALS_DIR'),
    slidesFile: resolve('SLIDES_FILE'),
    dbFile: resolve('DB_FILE'),
  }
}

// /api, /media, /materials, /slides for `npm run dev` and `npm run preview` (production uses server/index.js).
// Paths are read when a server starts, so `vite build` (e.g. inside Docker) needs no .env.
function courseFiles(mode) {
  let routes
  // Block body on purpose: a function returned from configureServer would run as a post hook.
  const mount = (server) => {
    routes ??= courseRoutes(coursePaths(mode))
    for (const [prefix, handler] of routes) server.middlewares.use(prefix, handler)
  }
  return { name: 'course-files', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig(({ mode }) => ({
  base: './',
  envDir: REPO_ROOT,
  plugins: [react(), courseFiles(mode)],
  server: { port: 5173, open: false },
}))
