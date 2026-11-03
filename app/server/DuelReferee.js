// Referee for live duels (1v1 and 2v2). Everything lives in memory: who is online, open challenges, lobby rooms
// and running matches. Clients poll; each call first moves the match forward on the server clock, so no timers run.
import { randomUUID } from 'node:crypto'
import { DuelRules } from '../src/core/DuelRules.js'
import { QuestionDifficulty } from '../src/core/QuestionDifficulty.js'
import { QuizSession } from '../src/core/QuizSession.js'

const ONLINE_MS = 10_000 // no heartbeat for this long: offline, and out of any lobby room
const CHALLENGE_MS = 30_000
const FORFEIT_MS = 30_000 // a fighter who stops polling mid-match is knocked out
const RESULT_PAUSE_MS = 4_000 // time to play the round's animation before the next round opens
const START_DELAY_MS = 1_500 // a short "fight!" before round one
const TEAMS = ['A', 'B']

export class DuelError extends Error {}

export class DuelReferee {
  /** `onFinish(match)` records the result; `now` is injectable for tests. */
  constructor({ quizzes, onFinish = () => {}, now = Date.now }) {
    this.pools = QuestionDifficulty.pools(quizzes)
    this.questions = new Map(quizzes.flatMap((quiz) => quiz.questions.map((q) => [String(q.id), q])))
    this.onFinish = onFinish
    this.now = now
    this.online = new Map() // user id -> { user, seenAt }
    this.names = new Map() // user id -> username, for everyone ever seen
    this.challenges = new Map() // `${from}>${to}` -> { from, to, rounds, at }
    this.rooms = new Map() // room id -> { id, host, mode, rounds, seats: { A: [ids], B: [ids] } }
    this.roomOf = new Map() // user id -> room id
    this.matches = new Map() // match id -> match
    this.matchOf = new Map() // user id -> match id, while it runs
  }

  // ---------------------------------------------------------------- lobby

  /** Mark `user` online; returns who else is, challenges for them, open rooms, their room and their running match. */
  heartbeat(user) {
    const now = this.now()
    this.#see(user)
    this.online.set(user.id, { user, seenAt: now })
    for (const [id, entry] of this.online) {
      if (now - entry.seenAt <= ONLINE_MS) continue
      this.online.delete(id)
      this.#leaveRoom(id)
    }
    for (const [key, c] of this.challenges) if (now - c.at > CHALLENGE_MS || !this.online.has(c.from)) this.challenges.delete(key)
    const match = this.#runningMatch(user.id)
    return {
      online: [...this.online.values()]
        .filter((e) => e.user.id !== user.id)
        .map((e) => ({ id: e.user.id, username: e.user.username, busy: !this.#free(e.user.id), challenged: this.challenges.has(`${user.id}>${e.user.id}`) })),
      challenges: [...this.challenges.values()].filter((c) => c.to === user.id).map((c) => ({ from: c.from, username: this.names.get(c.from), rounds: c.rounds })),
      rooms: [...this.rooms.values()].filter((r) => !r.private).map((r) => this.#roomView(r)),
      room: this.roomOf.has(user.id) ? this.#roomView(this.rooms.get(this.roomOf.get(user.id))) : null,
      matchId: match?.id ?? null,
    }
  }

  /** Direct 1v1 challenge for `rounds` rounds; it starts as soon as the opponent accepts. */
  challenge(user, to, rounds) {
    this.#see(user)
    if (!DuelRules.ROUND_OPTIONS.includes(rounds)) throw new DuelError('bad_request')
    if (to === user.id || !this.online.has(to)) throw new DuelError('not_online')
    if (!this.#free(to) || !this.#free(user.id)) throw new DuelError('busy')
    this.challenges.set(`${user.id}>${to}`, { from: user.id, to, rounds, at: this.now() })
    return { ok: true }
  }

  respond(user, from, accept) {
    this.#see(user)
    const challenge = this.challenges.get(`${from}>${user.id}`)
    if (!challenge) throw new DuelError('no_challenge')
    this.challenges.delete(`${from}>${user.id}`)
    if (!accept) return { matchId: null }
    if (!this.#free(from) || !this.#free(user.id) || !this.online.has(from)) throw new DuelError('busy')
    const room = this.#openRoom(from, '1v1', challenge.rounds, true)
    room.seats.B.push(user.id)
    this.roomOf.set(user.id, room.id)
    return { matchId: this.#startMatch(room).id }
  }

  /** Open a lobby room; its host takes the first seat of team A. */
  createRoom(user, { mode, rounds }) {
    this.#see(user)
    if (!DuelRules.TEAM_SIZE[mode] || !DuelRules.ROUND_OPTIONS.includes(rounds)) throw new DuelError('bad_request')
    if (this.matchOf.has(user.id)) throw new DuelError('busy')
    this.#leaveRoom(user.id)
    return { room: this.#roomView(this.#openRoom(user.id, mode, rounds, false)) }
  }

  /** Take (or switch to) a seat on `team` in a room. */
  joinRoom(user, roomId, team) {
    this.#see(user)
    const room = this.rooms.get(roomId)
    if (!room || room.private) throw new DuelError('no_room')
    if (!TEAMS.includes(team)) throw new DuelError('bad_request')
    if (this.matchOf.has(user.id)) throw new DuelError('busy')
    const seats = room.seats[team].filter((id) => id !== user.id)
    if (seats.length >= DuelRules.TEAM_SIZE[room.mode]) throw new DuelError('room_full')
    if (this.roomOf.get(user.id) !== room.id) this.#leaveRoom(user.id)
    for (const t of TEAMS) room.seats[t] = room.seats[t].filter((id) => id !== user.id)
    room.seats[team].push(user.id)
    this.roomOf.set(user.id, room.id)
    return { room: this.#roomView(room) }
  }

  leaveRoom(user) {
    this.#leaveRoom(user.id)
    return { ok: true }
  }

  /** The host starts a full room. */
  startRoom(user) {
    const room = this.rooms.get(this.roomOf.get(user.id))
    if (!room || room.host !== user.id) throw new DuelError('not_host')
    if (!this.#isFull(room)) throw new DuelError('room_not_full')
    return { matchId: this.#startMatch(room).id }
  }

  // ---------------------------------------------------------------- match

  /** The match as `user` sees it: other fighters' actions and questions stay hidden until the round resolves. */
  view(user, matchId) {
    const match = this.matches.get(matchId)
    const me = match?.fighters.find((f) => f.id === user.id)
    if (!me) throw new DuelError('no_match')
    match.seen[user.id] = this.now()
    this.#advance(match)
    const mine = match.moves[user.id]
    return {
      id: match.id,
      serverNow: this.now(),
      mode: match.mode,
      maxRounds: match.maxRounds,
      round: match.round,
      roundStart: match.roundStart,
      chooseUntil: this.#chooseUntil(match),
      me: user.id,
      team: me.team,
      fighters: match.fighters.map((f) => ({
        id: f.id,
        username: f.username,
        team: f.team,
        hp: match.hp[f.id],
        ...match.status[f.id],
        picked: Boolean(match.moves[f.id]),
        answered: Boolean(match.moves[f.id]?.answeredAt),
      })),
      move: mine && { action: mine.action, level: mine.level, target: mine.target, questionId: mine.questionId, deadline: mine.deadline, answered: Boolean(mine.answeredAt) },
      last: match.last,
      over: match.over,
      winner: match.winner,
      elo: match.elo ?? null, // { id: { before, after, delta } }, set when the result is recorded
    }
  }

  move(user, { action, level, target }) {
    const match = this.#playing(user)
    const now = this.now()
    if (!DuelRules.ACTIONS.includes(action) || !QuestionDifficulty.LEVELS.includes(level)) throw new DuelError('bad_move')
    if (match.hp[user.id] === 0) throw new DuelError('knocked_out')
    if (now < match.roundStart || now > this.#chooseUntil(match)) throw new DuelError('not_now')
    if (match.moves[user.id]) throw new DuelError('already_moved')
    const fresh = this.pools[level].filter((q) => !match.used.has(q.id))
    const pool = fresh.length ? fresh : this.pools[level]
    const question = pool[Math.floor(Math.random() * pool.length)]
    match.used.add(question.id)
    match.moves[user.id] = {
      action,
      level,
      target: Number.isInteger(target) ? target : null, // DuelRules.aim falls back to a valid target
      questionId: question.id,
      chosenAt: now,
      deadline: now + DuelRules.ANSWER_SECONDS[level] * 1000,
    }
    return this.view(user, match.id)
  }

  answer(user, picked) {
    const match = this.#playing(user)
    const move = match.moves[user.id]
    if (!move || move.answeredAt) throw new DuelError('not_now')
    const question = this.questions.get(String(move.questionId))
    if (!Array.isArray(picked) || !picked.length || !picked.every((i) => Number.isInteger(i) && i >= 0 && i < question.options.length)) {
      throw new DuelError('bad_move')
    }
    const now = this.now()
    if (now > move.deadline) throw new DuelError('too_late')
    Object.assign(move, { answeredAt: now, picked, correct: QuizSession.matches(question, picked) })
    return this.view(user, match.id)
  }

  /** Walking away (or closing the arena) knocks you out; a team with nobody left loses. */
  leave(user) {
    const match = this.#runningMatch(user.id)
    if (match) {
      match.hp[user.id] = 0
      this.#settleWinner(match)
    }
    return { ok: true }
  }

  // ---------------------------------------------------------------- internals

  #see(user) {
    this.names.set(user.id, user.username)
  }

  #free(id) {
    return !this.matchOf.has(id) && !this.roomOf.has(id)
  }

  #openRoom(host, mode, rounds, isPrivate) {
    const room = { id: randomUUID(), host, mode, rounds, private: isPrivate, seats: { A: [host], B: [] } }
    this.rooms.set(room.id, room)
    this.roomOf.set(host, room.id)
    return room
  }

  #isFull(room) {
    return TEAMS.every((t) => room.seats[t].length === DuelRules.TEAM_SIZE[room.mode])
  }

  #roomView(room) {
    const seat = (id) => ({ id, username: this.names.get(id) })
    return {
      id: room.id,
      host: room.host,
      hostName: this.names.get(room.host),
      mode: room.mode,
      rounds: room.rounds,
      size: DuelRules.TEAM_SIZE[room.mode],
      seats: { A: room.seats.A.map(seat), B: room.seats.B.map(seat) },
      full: this.#isFull(room),
    }
  }

  /** Leave a lobby room; the next member becomes host, and an empty room closes. */
  #leaveRoom(id) {
    const room = this.rooms.get(this.roomOf.get(id))
    this.roomOf.delete(id)
    if (!room) return
    for (const t of TEAMS) room.seats[t] = room.seats[t].filter((s) => s !== id)
    const left = [...room.seats.A, ...room.seats.B]
    if (!left.length) this.rooms.delete(room.id)
    else if (room.host === id) room.host = left[0]
  }

  #startMatch(room) {
    const now = this.now()
    const fighters = TEAMS.flatMap((team) => room.seats[team].map((id) => ({ id, username: this.names.get(id), team })))
    const match = {
      id: randomUUID(),
      mode: room.mode,
      maxRounds: room.rounds,
      fighters,
      hp: Object.fromEntries(fighters.map((f) => [f.id, DuelRules.MAX_HP])),
      status: Object.fromEntries(fighters.map((f) => [f.id, { guarded: false, buffed: false }])), // earned last round
      round: 1,
      roundStart: now + START_DELAY_MS,
      moves: {},
      used: new Set(),
      last: null,
      winner: undefined, // team, or null for a draw
      over: false,
      seen: Object.fromEntries(fighters.map((f) => [f.id, now])),
    }
    this.matches.set(match.id, match)
    this.rooms.delete(room.id)
    for (const f of fighters) {
      this.roomOf.delete(f.id)
      this.matchOf.set(f.id, match.id)
    }
    return match
  }

  #chooseUntil(match) {
    return match.roundStart + DuelRules.CHOOSE_SECONDS * 1000
  }

  #runningMatch(userId) {
    const match = this.matches.get(this.matchOf.get(userId))
    if (match) this.#advance(match)
    return match && !match.over ? match : null
  }

  #playing(user) {
    const match = this.#runningMatch(user.id)
    if (!match) throw new DuelError('no_match')
    match.seen[user.id] = this.now()
    return match
  }

  #ruleFighters(match) {
    return match.fighters.map((f) => ({ id: f.id, team: f.team, hp: match.hp[f.id], ...match.status[f.id] }))
  }

  /** Finish the match once a team is wiped out (or no rounds are left). */
  #settleWinner(match) {
    const played = match.last?.round ?? 0
    const winner = DuelRules.winner(this.#ruleFighters(match), match.maxRounds - played)
    if (winner !== undefined) this.#finish(match, winner)
    return winner !== undefined
  }

  /** Close the round once every standing fighter answered or ran out of time. */
  #advance(match) {
    if (match.over) return
    const now = this.now()
    for (const f of match.fighters) if (match.hp[f.id] > 0 && now - match.seen[f.id] > FORFEIT_MS) match.hp[f.id] = 0
    if (this.#settleWinner(match) || now < match.roundStart) return
    const standing = match.fighters.filter((f) => match.hp[f.id] > 0)
    const settled = (f) => {
      const m = match.moves[f.id]
      return m ? Boolean(m.answeredAt) || now > m.deadline : now > this.#chooseUntil(match)
    }
    if (!standing.every(settled)) return

    const moves = Object.fromEntries(
      standing
        .filter((f) => match.moves[f.id])
        .map((f) => {
          const m = match.moves[f.id]
          return [f.id, { action: m.action, level: m.level, target: m.target, correct: Boolean(m.correct), answeredMs: (m.answeredAt ?? m.deadline) - match.roundStart }]
        }),
    )
    const out = DuelRules.resolveRound(this.#ruleFighters(match), moves)
    match.last = {
      round: match.round,
      hits: out.hits,
      players: Object.fromEntries(
        match.fighters.map((f) => {
          const m = match.moves[f.id]
          const move = m && { action: m.action, level: m.level, correct: Boolean(m.correct), questionId: m.questionId, picked: m.picked ?? [] }
          return [f.id, { move, ...match.status[f.id], next: out.next[f.id], hp: out.hp[f.id] }]
        }),
      ),
    }
    match.hp = out.hp
    match.status = out.next
    match.moves = {}
    if (this.#settleWinner(match)) return
    match.round++
    match.roundStart = now + RESULT_PAUSE_MS
  }

  #finish(match, winner) {
    if (match.over) return
    match.over = true
    match.winner = winner
    match.fighters.forEach((f) => this.matchOf.delete(f.id))
    this.onFinish(match)
    // keep the finished match a while so everyone can read the result, then drop it
    setTimeout(() => this.matches.delete(match.id), 5 * 60_000).unref?.()
  }
}
