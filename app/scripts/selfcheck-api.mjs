// Assert-based self-check for the study API over real HTTP (in-memory DB): `npm run check`
import assert from 'node:assert/strict'
import http from 'node:http'
import { studyApi } from '../server/StudyApi.js'
import { DuelReferee } from '../server/DuelReferee.js'

const api = studyApi(':memory:')
const server = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api/, '')
  api(req, res, () => {
    res.statusCode = 404
    res.end()
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/api`

/** Minimal cookie-keeping client, one per simulated browser. */
function client() {
  let cookie = ''
  return async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, data: await res.json() }
  }
}

try {
  const anna = client()
  const ben = client()

  assert.equal((await anna('GET', '/me')).status, 401, 'no session yet')
  assert.equal((await anna('POST', '/register', { username: 'an', password: 'longenough' })).data.error, 'invalid_username')
  assert.equal((await anna('POST', '/register', { username: 'anna', password: 'short' })).data.error, 'weak_password')
  assert.equal((await anna('POST', '/register', { username: 'anna', password: 'anna-pass-1' })).status, 200)
  assert.equal((await ben('POST', '/register', { username: 'ANNA', password: 'whatever-1' })).data.error, 'username_taken', 'names are case-insensitive')
  assert.equal((await ben('POST', '/register', { username: 'ben', password: 'ben-pass-1' })).status, 200)

  // each account keeps its own progress
  await anna('POST', '/progress', { state: { lectures: { '02-004': 1 } } })
  await ben('POST', '/progress', { state: { lectures: { '05-001': 2 } } })
  assert.deepEqual((await anna('GET', '/progress')).data.state, { lectures: { '02-004': 1 } })
  assert.deepEqual((await ben('GET', '/progress')).data.state, { lectures: { '05-001': 2 } })
  assert.equal((await anna('POST', '/progress', { state: [1] })).data.error, 'bad_request')

  // login / logout
  const annaLaptop = client()
  assert.equal((await annaLaptop('POST', '/login', { username: 'anna', password: 'wrong-pass' })).data.error, 'invalid_credentials')
  assert.equal((await annaLaptop('POST', '/login', { username: 'nobody', password: 'wrong-pass' })).data.error, 'invalid_credentials')
  assert.equal((await annaLaptop('POST', '/login', { username: 'Anna', password: 'anna-pass-1' })).data.user.username, 'anna')
  assert.deepEqual((await annaLaptop('GET', '/progress')).data.state, { lectures: { '02-004': 1 } }, 'same account, other browser')
  await annaLaptop('POST', '/logout')
  assert.equal((await annaLaptop('GET', '/progress')).status, 401, 'session ended')
  assert.equal((await anna('GET', '/me')).data.user.username, 'anna', 'other sessions stay signed in')

  // leaderboards and survival scores
  assert.equal((await ben('POST', '/games/survival', { mode: 'cheat', score: 1, streak: 1 })).data.error, 'bad_request')
  assert.equal((await ben('POST', '/games/survival', { mode: 'hard-hardcore', score: 1.5, streak: 1 })).data.error, 'bad_request')
  await ben('POST', '/games/survival', { mode: 'hard-hardcore', score: 120, streak: 4 })
  await ben('POST', '/games/survival', { mode: 'hard-hardcore', score: 80, streak: 6 })
  const boards = (await anna('GET', '/leaderboards')).data
  assert.deepEqual(boards.survival['hard-hardcore'], [{ username: 'ben', score: 120, streak: 6, runs: 2 }], 'best score and streak per player')
  assert.deepEqual(boards.study.map((r) => r.username), ['anna', 'ben'], 'every account is ranked')
  assert.equal((await ben('POST', '/arena/move', { action: 'attack', level: 'easy' })).data.error, 'no_match')

  console.log('selfcheck-api OK')
} finally {
  server.close()
}

// the duel referee on a fake clock: challenges with a round count, lobby rooms, 2v2, timeouts
{
  let clock = 1_000_000
  const finished = []
  const quizzes = [{ id: 's', kind: 'section', questions: [1, 2, 3, 4, 5, 6].map((id) => ({ id, options: ['a', 'b'], answer: [0] })) }]
  const ref = new DuelReferee({ quizzes, onFinish: (m) => finished.push(m), now: () => clock })
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((username, i) => ({ id: i + 1, username }))
  const online = () => [a, b, c, d].forEach((u) => ref.heartbeat(u))
  const play = (user, action, target) => {
    ref.move(user, { action, level: 'easy', target })
    ref.answer(user, [0])
  }

  // 1v1 challenge for 3 rounds: ends on rounds, not a knockout
  online()
  assert.throws(() => ref.challenge(a, b.id, 5), /bad_request/, 'only 3, 6, 9 or 12 rounds')
  ref.challenge(a, b.id, 3)
  assert.deepEqual(ref.heartbeat(b).challenges, [{ from: 1, username: 'a', rounds: 3 }])
  const { matchId } = ref.respond(b, a.id, true)
  assert.equal(ref.heartbeat(a).matchId, matchId)
  assert.throws(() => ref.move(a, { action: 'attack', level: 'easy' }), /not_now/, 'no move before the round opens')
  for (let round = 1; round <= 3; round++) {
    clock = ref.view(a, matchId).roundStart
    play(a, 'attack')
    if (round === 1) assert.equal(ref.view(b, matchId).fighters.find((f) => f.id === a.id).picked, true, 'b sees that a picked, not what')
    clock += 16_000 // b never picks: the choice window closes and the round resolves
    ref.view(b, matchId)
  }
  const done = ref.view(b, matchId)
  assert.deepEqual([done.over, done.winner, done.maxRounds], [true, 'A', 3], 'after 3 rounds the higher HP wins')
  assert.equal(finished.length, 1, 'result recorded once')

  // lobby room, 2v2: seats, host start, team play
  clock += 1000
  online()
  const { room } = ref.createRoom(a, { mode: '2v2', rounds: 6 })
  assert.equal(ref.heartbeat(c).rooms[0].id, room.id, 'open rooms are listed')
  ref.joinRoom(b, room.id, 'A')
  ref.joinRoom(c, room.id, 'B')
  assert.throws(() => ref.startRoom(a), /room_not_full/)
  assert.throws(() => ref.joinRoom(d, room.id, 'A'), /room_full/)
  ref.joinRoom(d, room.id, 'B')
  assert.throws(() => ref.startRoom(c), /not_host/)
  const team = ref.startRoom(a).matchId
  assert.deepEqual(ref.view(c, team).fighters.map((f) => f.team), ['A', 'A', 'B', 'B'])
  clock = ref.view(a, team).roundStart
  play(a, 'buff', b.id) // a buffs b
  play(b, 'attack', c.id)
  play(c, 'defend', d.id) // c guards d for next round
  play(d, 'attack', a.id)
  const r1 = ref.view(a, team)
  assert.deepEqual([r1.fighters.find((f) => f.id === b.id).buffed, r1.fighters.find((f) => f.id === d.id).guarded], [true, true])
  clock = r1.roundStart
  play(b, 'attack', d.id) // buffed into a guard
  clock += 16_000
  const r2 = ref.view(a, team)
  const onD = r2.last.hits.find((h) => h.from === b.id)
  assert.deepEqual([onD.to, onD.kind, onD.damage], [d.id, 'blocked', Math.round(10 * 1.5 * 0.2)], 'buff and guard both apply')
  // c and d stop polling: knocked out after the forfeit time, team A wins
  for (let i = 0; i < 8; i++) {
    clock += 5_000
    ref.view(a, team)
    ref.view(b, team)
  }
  assert.deepEqual([ref.view(a, team).over, ref.view(a, team).winner], [true, 'A'], 'a team that left is knocked out')
  assert.equal(finished.length, 2)
  assert.deepEqual(finished[1].fighters.map((f) => f.team), ['A', 'A', 'B', 'B'])

  // leaving a room passes the host on; the last one out closes it
  clock += 1000
  online()
  const solo = ref.createRoom(c, { mode: '1v1', rounds: 9 }).room
  ref.joinRoom(d, solo.id, 'B')
  ref.leaveRoom(c)
  assert.equal(ref.heartbeat(d).room.host, d.id)
  ref.leaveRoom(d)
  assert.equal(ref.heartbeat(d).rooms.length, 0)
  console.log('duel referee OK')
}
