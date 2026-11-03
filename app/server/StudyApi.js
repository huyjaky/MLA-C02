// Local study API: accounts, sessions and per-account progress in one SQLite file.
// Mounted at /api by vite.config.js for both `npm run dev` and `npm run preview`.
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { DuelError, DuelReferee } from './DuelReferee.js'
import { DuelRules } from '../src/core/DuelRules.js'
import { SurvivalRun } from '../src/core/SurvivalRun.js'
import { Elo } from '../src/core/Elo.js'

const scrypt = promisify(scryptCallback)
const SESSION_DAYS = 30
const SESSION_COOKIE = 'mla_session'
const MAX_BODY_BYTES = 1_000_000 // a full progress blob is ~100 KB
const USERNAME = /^[\p{L}\p{N}_.-]{3,32}$/u
const MIN_PASSWORD = 8
const DAY_MS = 86_400_000
const MAX_SURVIVAL_SCORE = 1_000_000 // far above any honest run over the whole question bank
const LEADERBOARD_ROWS = 50
const MASTERED_BOX = 4 // Leitner box from which a flashcard counts as learned

class HttpError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}

/** scrypt with a random salt per password, stored as "salt:hash" (hex). */
class PasswordHasher {
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
      CREATE TABLE IF NOT EXISTS game_results (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game TEXT NOT NULL,          -- 'duel' | 'survival'
        mode TEXT NOT NULL,          -- duel: '1v1'; survival: level, optionally '-hardcore'
        result TEXT,                 -- duel: 'win' | 'loss' | 'draw'
        score INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS game_results_board ON game_results (game, mode, user_id);
      CREATE TABLE IF NOT EXISTS ratings (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,          -- duel mode: '1v1' | '2v2'
        rating INTEGER NOT NULL,
        games INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, mode)
      );
    `)
  }

  /** Prepared statement for `sql`, compiled once: session lookups run on every request, duel polls every 700 ms. */
  #sql(sql) {
    this.statements ??= new Map()
    if (!this.statements.has(sql)) this.statements.set(sql, this.db.prepare(sql))
    return this.statements.get(sql)
  }

  static #digest(token) {
    return createHash('sha256').update(token).digest('hex')
  }

  userByName(username) {
    return this.#sql('SELECT id, username, password_hash FROM users WHERE username = ?').get(username)
  }

  createUser(username, passwordHash) {
    const result = this.#sql('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, passwordHash, Date.now())
    return { id: Number(result.lastInsertRowid), username }
  }

  createSession(userId) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + SESSION_DAYS * DAY_MS
    this.#sql('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
    this.#sql('INSERT INTO sessions VALUES (?, ?, ?)').run(StudyDatabase.#digest(token), userId, expiresAt)
    return token
  }

  userBySession(token) {
    if (!token) return null
    return (
      this.#sql('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
        .get(StudyDatabase.#digest(token), Date.now()) ?? null
    )
  }

  deleteSession(token) {
    if (token) this.#sql('DELETE FROM sessions WHERE token_hash = ?').run(StudyDatabase.#digest(token))
  }

  progress(userId) {
    const row = this.#sql('SELECT state FROM progress WHERE user_id = ?').get(userId)
    return row ? JSON.parse(row.state) : null
  }

  saveProgress(userId, state) {
    this.#sql(`INSERT INTO progress (user_id, state, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`)
      .run(userId, JSON.stringify(state), Date.now())
  }

  addResult(userId, { game, mode, result = null, score = 0, streak = 0 }) {
    this.#sql('INSERT INTO game_results (user_id, game, mode, result, score, streak, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, game, mode, result, score, streak, Date.now())
  }

  /** { mode: [rows] } for every duel mode, best Elo first, with each player's record; one query. */
  duelBoards(modes) {
    const boards = Object.fromEntries(modes.map((mode) => [mode, []]))
    const rows = this.#sql(`SELECT r.mode, u.username, r.rating AS elo,
                  COALESCE(SUM(g.result = 'win'), 0) AS wins, COALESCE(SUM(g.result = 'loss'), 0) AS losses,
                  COALESCE(SUM(g.result = 'draw'), 0) AS draws
                FROM ratings r JOIN users u ON u.id = r.user_id
                LEFT JOIN game_results g ON g.user_id = r.user_id AND g.game = 'duel' AND g.mode = r.mode
                GROUP BY r.mode, r.user_id ORDER BY r.rating DESC, wins DESC, u.username`).all()
    for (const { mode, ...row } of rows) if (boards[mode]?.length < LEADERBOARD_ROWS) boards[mode].push(row)
    return boards
  }

  /** Map of user id -> Elo in `mode`; players without a rating yet get the starting one. */
  ratings(mode, ids) {
    const rows = this.#sql('SELECT user_id, rating FROM ratings WHERE mode = ? AND user_id IN (SELECT value FROM json_each(?))').all(mode, JSON.stringify(ids))
    const found = new Map(rows.map((r) => [r.user_id, r.rating]))
    return new Map(ids.map((id) => [id, found.get(id) ?? Elo.START]))
  }

  setRating(userId, mode, rating) {
    this.#sql(`INSERT INTO ratings (user_id, mode, rating, games) VALUES (?, ?, ?, 1)
               ON CONFLICT(user_id, mode) DO UPDATE SET rating = excluded.rating, games = games + 1`).run(userId, mode, rating)
  }

  /** { mode: [best rows] } for every survival mode, from one query. */
  survivalBoards(modes) {
    const boards = Object.fromEntries(modes.map((mode) => [mode, []]))
    const rows = this.#sql(`SELECT g.mode, u.username, MAX(score) AS score, MAX(streak) AS streak, COUNT(*) AS runs
                FROM game_results g JOIN users u ON u.id = g.user_id WHERE g.game = 'survival'
                GROUP BY g.mode, g.user_id ORDER BY score DESC, streak DESC, u.username`).all()
    for (const { mode, ...row } of rows) if (boards[mode]?.length < LEADERBOARD_ROWS) boards[mode].push(row)
    return boards
  }

  /** Every account's username and saved progress, for the study leaderboard. */
  allProgress() {
    return this.#sql('SELECT u.username, p.state FROM users u LEFT JOIN progress p ON p.user_id = u.id')
      .all()
      .map((row) => ({ username: row.username, state: row.state ? JSON.parse(row.state) : {} }))
  }
}

/** Routes for /api. Each handler gets { req, res, body, user } and returns the JSON to send. */
export class StudyApi {
  constructor(db, quizzes = []) {
    this.db = db
    this.examIds = quizzes.filter((q) => q.kind === 'exam').map((q) => q.id)
    this.referee = new DuelReferee({ quizzes, onFinish: (match) => this.recordDuel(match) })
    const arena = (fn) => (c) => {
      const user = this.requireUser(c)
      try {
        return fn(user, c.body)
      } catch (error) {
        if (error instanceof DuelError) throw new HttpError(409, error.message)
        throw error
      }
    }
    this.routes = {
      'POST /register': (c) => this.register(c),
      'POST /login': (c) => this.login(c),
      'POST /logout': (c) => this.logout(c),
      'GET /me': (c) => ({ user: this.requireUser(c) }),
      'GET /progress': (c) => ({ state: this.db.progress(this.requireUser(c).id) }),
      'POST /progress': (c) => this.saveProgress(c),
      'GET /leaderboards': (c) => this.leaderboards(c),
      'POST /games/survival': (c) => this.saveSurvival(c),
      'POST /arena/presence': arena((user) => this.withElo(user, this.referee.heartbeat(user))),
      'POST /arena/challenge': arena((user, body) => this.referee.challenge(user, Number(body.to), Number(body.rounds))),
      'POST /arena/respond': arena((user, body) => this.referee.respond(user, Number(body.from), body.accept === true)),
      'POST /arena/match': arena((user, body) => this.referee.view(user, String(body.id ?? ''))),
      'POST /arena/move': arena((user, body) => this.referee.move(user, { action: body.action, level: body.level, target: body.target })),
      'POST /arena/room/create': arena((user, body) => this.referee.createRoom(user, { mode: body.mode, rounds: Number(body.rounds) })),
      'POST /arena/room/join': arena((user, body) => this.referee.joinRoom(user, String(body.id ?? ''), body.team)),
      'POST /arena/room/leave': arena((user) => this.referee.leaveRoom(user)),
      'POST /arena/room/start': arena((user) => this.referee.startRoom(user)),
      'POST /arena/answer': arena((user, body) => this.referee.answer(user, body.picked)),
      'POST /arena/leave': arena((user) => this.referee.leave(user)),
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
    res.setHeader('Set-Cookie', sessionCookie('', 0))
    return { ok: true }
  }

  saveProgress(context) {
    const user = this.requireUser(context)
    const { state } = context.body
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new HttpError(400, 'bad_request')
    this.db.saveProgress(user.id, state)
    return { ok: true }
  }

  saveSurvival(context) {
    const user = this.requireUser(context)
    const { mode, score, streak } = context.body
    const valid = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_SURVIVAL_SCORE
    if (!SurvivalRun.MODES.includes(mode) || !valid(score) || !valid(streak)) throw new HttpError(400, 'bad_request')
    // shortcut: the client keeps the survival score, so a hand-made request can fake one; move scoring server-side if that matters
    this.db.addResult(user.id, { game: 'survival', mode, score, streak })
    return { ok: true }
  }

  /** Save each fighter's result and new Elo; the changes ride on the match so the end screen can show them. */
  recordDuel(match) {
    const current = this.db.ratings(match.mode, match.fighters.map((f) => f.id))
    const teams = { A: [], B: [] }
    for (const f of match.fighters) teams[f.team].push({ id: f.id, rating: current.get(f.id) })
    match.elo = Elo.update(teams, match.winner)
    for (const f of match.fighters) {
      this.db.addResult(f.id, { game: 'duel', mode: match.mode, result: DuelRules.outcomeFor(match.winner, f.team) })
      this.db.setRating(f.id, match.mode, match.elo[f.id].after)
    }
  }

  /** Lobby data with Elo: yours per mode, each online player's 1v1 rating, and seats rated for the room's mode. */
  withElo(user, presence) {
    const seats = presence.room ? [...presence.room.seats.A, ...presence.room.seats.B] : []
    const ids = [user.id, ...presence.online.map((p) => p.id), ...seats.map((s) => s.id)]
    const elo = Object.fromEntries(Object.keys(DuelRules.TEAM_SIZE).map((mode) => [mode, this.db.ratings(mode, ids)]))
    const rateSeats = (room) => ({
      ...room,
      seats: Object.fromEntries(Object.entries(room.seats).map(([t, list]) => [t, list.map((s) => ({ ...s, elo: elo[room.mode].get(s.id) }))])),
    })
    return {
      ...presence,
      myElo: Object.fromEntries(Object.entries(elo).map(([mode, map]) => [mode, map.get(user.id)])),
      online: presence.online.map((p) => ({ ...p, elo: elo['1v1'].get(p.id) })),
      room: presence.room && rateSeats(presence.room),
    }
  }

  /** Study ranking (lectures done, then exam average, then learned flashcards), duel wins, survival best per mode. */
  leaderboards(context) {
    this.requireUser(context)
    const study = this.db
      .allProgress()
      .map(({ username, state }) => {
        const bests = this.examIds.map((id) => state.quizzes?.[id]?.best ?? 0)
        return {
          username,
          lectures: Object.keys(state.lectures ?? {}).length,
          exam: bests.length ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length) : 0,
          cards: Object.values(state.leitner ?? {}).filter((c) => c?.box >= MASTERED_BOX).length,
        }
      })
      .sort((a, b) => b.lectures - a.lectures || b.exam - a.exam || b.cards - a.cards || a.username.localeCompare(b.username))
      .slice(0, LEADERBOARD_ROWS)
    return { study, duel: this.db.duelBoards(Object.keys(DuelRules.TEAM_SIZE)), survival: this.db.survivalBoards(SurvivalRun.MODES) }
  }

  startSession(res, userId) {
    const token = this.db.createSession(userId)
    res.setHeader('Set-Cookie', sessionCookie(token, (SESSION_DAYS * DAY_MS) / 1000))
  }
}

// SameSite=Lax keeps the cookie off cross-site POSTs, which is the CSRF guard for this local API.
const sessionCookie = (value, maxAgeSeconds) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`

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

/** Every quiz file, so the duel referee can pick and judge questions itself. */
function loadQuizzes() {
  const dir = new URL('../content/quizzes/', import.meta.url)
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')))
}

/** Middleware for vite.config.js: `server.middlewares.use('/api', studyApi(file))`. */
export const studyApi = (dbFile) => new StudyApi(new StudyDatabase(dbFile), loadQuizzes()).middleware
