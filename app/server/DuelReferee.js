// Referee for live 1v1 duels. Everything lives in memory: who is online, open challenges and running
// matches. Clients poll; each call first moves the match forward on the server clock, so no timers run.
import { randomUUID } from 'node:crypto'
import { DuelRules } from '../src/core/DuelRules.js'
import { QuestionDifficulty } from '../src/core/QuestionDifficulty.js'
import { QuizSession } from '../src/core/QuizSession.js'

const ONLINE_MS = 10_000 // no heartbeat for this long: offline
const CHALLENGE_MS = 30_000
const FORFEIT_MS = 30_000 // a player who stops polling mid-match loses
const RESULT_PAUSE_MS = 4_000 // time to play the round's animation before the next round opens
const MAX_ROUNDS = 15 // then the higher HP wins, so two defenders cannot stall forever

export class DuelError extends Error {}

export class DuelReferee {
  /** `onFinish(match)` records the result; `now` is injectable for tests. */
  constructor({ quizzes, onFinish = () => {}, now = Date.now }) {
    this.pools = QuestionDifficulty.pools(quizzes)
    this.questions = new Map(quizzes.flatMap((quiz) => quiz.questions.map((q) => [String(q.id), q])))
    this.onFinish = onFinish
    this.now = now
    this.online = new Map() // user id -> { user, seenAt }
    this.challenges = new Map() // `${from}>${to}` -> { from, to, at }
    this.matches = new Map() // match id -> match
    this.matchOf = new Map() // user id -> match id, while it runs
  }

  /** Mark `user` online; returns who else is, challenges waiting for them, and their running match. */
  heartbeat(user) {
    const now = this.now()
    this.online.set(user.id, { user, seenAt: now })
    for (const [id, entry] of this.online) if (now - entry.seenAt > ONLINE_MS) this.online.delete(id)
    for (const [key, c] of this.challenges) if (now - c.at > CHALLENGE_MS || !this.online.has(c.from)) this.challenges.delete(key)
    const match = this.#runningMatch(user.id)
    return {
      online: [...this.online.values()]
        .filter((e) => e.user.id !== user.id)
        .map((e) => ({ id: e.user.id, username: e.user.username, busy: this.matchOf.has(e.user.id), challenged: this.challenges.has(`${user.id}>${e.user.id}`) })),
      challenges: [...this.challenges.values()].filter((c) => c.to === user.id).map((c) => ({ from: c.from, username: this.online.get(c.from)?.user.username })),
      matchId: match?.id ?? null,
    }
  }

  challenge(user, to) {
    if (to === user.id || !this.online.has(to)) throw new DuelError('not_online')
    if (this.matchOf.has(to) || this.matchOf.has(user.id)) throw new DuelError('busy')
    this.challenges.set(`${user.id}>${to}`, { from: user.id, to, at: this.now() })
    return { ok: true }
  }

  respond(user, from, accept) {
    if (!this.challenges.delete(`${from}>${user.id}`)) throw new DuelError('no_challenge')
    if (!accept) return { matchId: null }
    if (this.matchOf.has(from) || this.matchOf.has(user.id) || !this.online.has(from)) throw new DuelError('busy')
    for (const [k, c] of this.challenges) if ([c.from, c.to].some((id) => id === from || id === user.id)) this.challenges.delete(k)
    const now = this.now()
    const players = [this.online.get(from).user, user]
    const match = {
      id: randomUUID(),
      players,
      hp: Object.fromEntries(players.map((p) => [p.id, DuelRules.MAX_HP])),
      round: 1,
      roundStart: now + 1500, // a short "fight!" before round one
      moves: {},
      used: new Set(),
      last: null,
      winner: undefined, // user id, null for a draw
      over: false,
      seen: Object.fromEntries(players.map((p) => [p.id, now])),
    }
    this.matches.set(match.id, match)
    players.forEach((p) => this.matchOf.set(p.id, match.id))
    return { matchId: match.id }
  }

  /** The match as `user` sees it: the opponent's action and question stay hidden until the round resolves. */
  view(user, matchId) {
    const match = this.matches.get(matchId)
    if (!match || !match.players.some((p) => p.id === user.id)) throw new DuelError('no_match')
    match.seen[user.id] = this.now()
    this.#advance(match)
    const opponent = match.players.find((p) => p.id !== user.id)
    const mine = match.moves[user.id]
    const theirs = match.moves[opponent.id]
    return {
      id: match.id,
      serverNow: this.now(),
      me: { id: user.id, username: user.username, hp: match.hp[user.id] },
      opponent: { id: opponent.id, username: opponent.username, hp: match.hp[opponent.id], picked: Boolean(theirs), answered: Boolean(theirs?.answeredAt) },
      round: match.round,
      roundStart: match.roundStart,
      chooseUntil: match.roundStart + DuelRules.CHOOSE_SECONDS * 1000,
      move: mine && { action: mine.action, level: mine.level, questionId: mine.questionId, deadline: mine.deadline, answered: Boolean(mine.answeredAt) },
      last: match.last,
      over: match.over,
      winner: match.winner,
    }
  }

  move(user, { action, level }) {
    const match = this.#playing(user)
    const now = this.now()
    if (!DuelRules.ACTIONS.includes(action) || !QuestionDifficulty.LEVELS.includes(level)) throw new DuelError('bad_move')
    if (now < match.roundStart || now > match.roundStart + DuelRules.CHOOSE_SECONDS * 1000) throw new DuelError('not_now')
    if (match.moves[user.id]) throw new DuelError('already_moved')
    const fresh = this.pools[level].filter((q) => !match.used.has(q.id))
    const pool = fresh.length ? fresh : this.pools[level]
    const question = pool[Math.floor(Math.random() * pool.length)]
    match.used.add(question.id)
    match.moves[user.id] = { action, level, questionId: question.id, chosenAt: now, deadline: now + DuelRules.ANSWER_SECONDS[level] * 1000 }
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

  /** Walking away (or closing the arena) hands the win to the opponent. */
  leave(user) {
    const match = this.#runningMatch(user.id)
    if (match) this.#finish(match, match.players.find((p) => p.id !== user.id).id)
    return { ok: true }
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

  /** Close the round once both players answered or ran out of time; end the match on a knockout. */
  #advance(match) {
    if (match.over) return
    const now = this.now()
    const gone = match.players.find((p) => now - match.seen[p.id] > FORFEIT_MS)
    if (gone) return this.#finish(match, match.players.find((p) => p !== gone).id)
    if (now < match.roundStart) return
    const settled = (p) => {
      const m = match.moves[p.id]
      return m ? Boolean(m.answeredAt) || now > m.deadline : now > match.roundStart + DuelRules.CHOOSE_SECONDS * 1000
    }
    if (!match.players.every(settled)) return

    const [a, b] = match.players
    const ruleMove = (p) => {
      const m = match.moves[p.id]
      return m && { action: m.action, level: m.level, correct: Boolean(m.correct), answeredMs: (m.answeredAt ?? m.deadline) - match.roundStart }
    }
    const outcome = DuelRules.resolve(ruleMove(a), ruleMove(b))
    match.hp[a.id] = Math.max(0, match.hp[a.id] - outcome.a.damage)
    match.hp[b.id] = Math.max(0, match.hp[b.id] - outcome.b.damage)
    const report = (p, taken) => {
      const m = match.moves[p.id]
      const move = m && { action: m.action, level: m.level, correct: Boolean(m.correct), questionId: m.questionId, picked: m.picked ?? [] }
      return [p.id, { move, taken, hp: match.hp[p.id] }]
    }
    match.last = { round: match.round, players: Object.fromEntries([report(a, outcome.a), report(b, outcome.b)]) }
    match.moves = {}
    if (match.hp[a.id] === 0 || match.hp[b.id] === 0 || match.round >= MAX_ROUNDS) {
      const winner = match.hp[a.id] === match.hp[b.id] ? null : match.hp[a.id] > match.hp[b.id] ? a.id : b.id
      return this.#finish(match, winner)
    }
    match.round++
    match.roundStart = now + RESULT_PAUSE_MS
  }

  #finish(match, winner) {
    if (match.over) return
    match.over = true
    match.winner = winner
    match.players.forEach((p) => this.matchOf.delete(p.id))
    this.onFinish(match)
    // keep the finished match a while so both players can read the result, then drop it
    setTimeout(() => this.matches.delete(match.id), 5 * 60_000).unref?.()
  }
}
