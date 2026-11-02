// Local study API: accounts, sessions and per-account progress in one SQLite file.
// Mounted at /api by vite.config.js for both `npm run dev` and `npm run preview`.
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

const scrypt = promisify(scryptCallback)
const SESSION_DAYS = 30
const SESSION_COOKIE = 'mla_session'
const MAX_BODY_BYTES = 1_000_000 // a full progress blob is ~100 KB
const USERNAME = /^[\p{L}\p{N}_.-]{3,32}$/u
const MIN_PASSWORD = 8
const DAY_MS = 86_400_000

class HttpError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}

/** scrypt with a random salt per password, stored as "salt:hash" (hex). */
export class PasswordHasher {
  static KEY_LENGTH = 64

  static async hash(password) {
    const salt = randomBytes(16)
    const key = await scrypt(password, salt, PasswordHasher.KEY_LENGTH)
    return `${salt.toString('hex')}:${key.toString('hex')}`
  }

  static async verify(password, stored) {
    const [saltHex, keyHex] = stored.split(':')
    const expected = Buffer.from(keyHex, 'hex')
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)
    return timingSafeEqual(actual, expected)
  }
}

/** Users, sessions and progress tables. Session tokens are stored only as SHA-256 hashes. */
export class StudyDatabase {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }

  static #digest(token) {
    return createHash('sha256').update(token).digest('hex')
  }

  userByName(username) {
    return this.db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username)
  }

  createUser(username, passwordHash) {
    const result = this.db
      .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, passwordHash, Date.now())
    return { id: Number(result.lastInsertRowid), username }
  }

  createSession(userId) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + SESSION_DAYS * DAY_MS
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
    this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(StudyDatabase.#digest(token), userId, expiresAt)
    return token
  }

  userBySession(token) {
    if (!token) return null
    return (
      this.db
        .prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
        .get(StudyDatabase.#digest(token), Date.now()) ?? null
    )
  }

  deleteSession(token) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(StudyDatabase.#digest(token))
  }

  progress(userId) {
    const row = this.db.prepare('SELECT state FROM progress WHERE user_id = ?').get(userId)
    return row ? JSON.parse(row.state) : null
  }

  saveProgress(userId, state) {
    this.db
      .prepare(`INSERT INTO progress (user_id, state, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`)
      .run(userId, JSON.stringify(state), Date.now())
  }
}

/** Routes for /api. Each handler gets { req, res, body, user } and returns the JSON to send. */
export class StudyApi {
  constructor(db) {
    this.db = db
    this.routes = {
      'POST /register': (c) => this.register(c),
      'POST /login': (c) => this.login(c),
      'POST /logout': (c) => this.logout(c),
      'GET /me': (c) => ({ user: this.requireUser(c) }),
      'GET /progress': (c) => ({ state: this.db.progress(this.requireUser(c).id) }),
      'POST /progress': (c) => this.saveProgress(c),
    }
  }

  /** Connect-style middleware (req.url is relative to the /api mount). */
  middleware = async (req, res, next) => {
    const route = this.routes[`${req.method} ${req.url.split('?')[0]}`]
    if (!route) return next()
    try {
      const body = req.method === 'POST' ? await readJson(req) : {}
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
      sendJson(res, 200, await route({ req, res, body, token, user: this.db.userBySession(token) }))
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('[study-api]', error)
      sendJson(res, error.status ?? 500, { error: error.code ?? 'server_error' })
    }
  }

  requireUser({ user }) {
    if (!user) throw new HttpError(401, 'unauthorized')
    return { id: user.id, username: user.username }
  }

  async register({ res, body }) {
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')
    if (!USERNAME.test(username)) throw new HttpError(400, 'invalid_username')
    if (password.length < MIN_PASSWORD) throw new HttpError(400, 'weak_password')
    if (this.db.userByName(username)) throw new HttpError(409, 'username_taken')
    const user = this.db.createUser(username, await PasswordHasher.hash(password))
    this.startSession(res, user.id)
    return { user }
  }

  async login({ res, body }) {
    const found = this.db.userByName(String(body.username ?? '').trim())
    // Same error for unknown user and wrong password, so names cannot be probed.
    if (!found || !(await PasswordHasher.verify(String(body.password ?? ''), found.password_hash))) {
      throw new HttpError(401, 'invalid_credentials')
    }
    this.startSession(res, found.id)
    return { user: { id: found.id, username: found.username } }
  }

  logout({ res, token }) {
    this.db.deleteSession(token)
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    return { ok: true }
  }

  saveProgress(context) {
    const user = this.requireUser(context)
    const { state } = context.body
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new HttpError(400, 'bad_request')
    this.db.saveProgress(user.id, state)
    return { ok: true }
  }

  startSession(res, userId) {
    const token = this.db.createSession(userId)
    // SameSite=Lax keeps the cookie off cross-site POSTs, which is the CSRF guard for this local API.
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`)
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim().split('=')).filter(([k, v]) => k && v !== undefined),
  )
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'too_large'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new HttpError(400, 'bad_request'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Middleware for vite.config.js: `server.middlewares.use('/api', studyApi(file))`. */
export const studyApi = (dbFile) => new StudyApi(new StudyDatabase(dbFile)).middleware
