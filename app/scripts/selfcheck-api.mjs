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

// the duel referee on a fake clock: challenge, rounds, timeouts, knockout
{
  let clock = 1_000_000
  const finished = []
  const quizzes = [{ id: 's', kind: 'section', questions: [{ id: 1, options: ['a', 'b'], answer: [0] }, { id: 2, options: ['a', 'b'], answer: [0] }] }]
  const ref = new DuelReferee({ quizzes, onFinish: (m) => finished.push(m), now: () => clock })
  const a = { id: 1, username: 'a' }
  const b = { id: 2, username: 'b' }
  ref.heartbeat(a)
  assert.deepEqual(ref.heartbeat(b).online.map((u) => u.username), ['a'])
  ref.challenge(a, b.id)
  assert.deepEqual(ref.heartbeat(b).challenges, [{ from: 1, username: 'a' }])
  const { matchId } = ref.respond(b, a.id, true)
  assert.equal(ref.heartbeat(a).matchId, matchId)
  assert.throws(() => ref.move(a, { action: 'attack', level: 'easy' }), /not_now/, 'no move before the round opens')
  clock += 1500
  const view = ref.move(a, { action: 'attack', level: 'easy' })
  assert.equal(view.move.level, 'easy')
  assert.equal(ref.view(b, matchId).opponent.picked, true, 'b sees that a picked, not what')
  assert.equal(ref.view(b, matchId).move, undefined)
  ref.answer(a, [0])
  clock += 16_000 // b never picks: the choice window closes and the round resolves
  const r1 = ref.view(b, matchId)
  assert.equal(r1.last.players[2].taken.kind, 'hit')
  assert.ok(r1.me.hp < 100 && r1.opponent.hp === 100)
  assert.throws(() => ref.move(a, { action: 'attack', level: 'easy' }), /not_now/, 'result pause before the next round')
  // knock b out: keep attacking instantly
  while (!ref.view(a, matchId).over) {
    clock = ref.view(a, matchId).roundStart
    ref.move(a, { action: 'attack', level: 'easy' })
    ref.answer(a, [0])
    ref.view(b, matchId)
    clock += 16_000
  }
  assert.equal(ref.view(b, matchId).winner, 1)
  assert.equal(finished.length, 1, 'result recorded once')
  assert.equal(ref.heartbeat(a).matchId, null, 'free for a new match')

  // walking away forfeits
  ref.heartbeat(b)
  ref.challenge(b, a.id)
  const second = ref.respond(a, b.id, true).matchId
  ref.leave(b)
  assert.equal(ref.view(a, second).winner, 1)
  // a correct defend guards the next round only
  ref.heartbeat(a)
  ref.heartbeat(b)
  ref.challenge(a, b.id)
  const third = ref.respond(b, a.id, true).matchId
  const play = (user, action) => {
    ref.move(user, { action, level: 'easy' })
    ref.answer(user, [0])
  }
  clock = ref.view(a, third).roundStart
  play(a, 'attack')
  play(b, 'defend')
  const g1 = ref.view(b, third)
  assert.deepEqual([g1.last.players[2].taken.kind, g1.me.guarded], ['hit', true], 'defend does not block this round, guards the next')
  clock = g1.roundStart
  play(a, 'attack')
  play(b, 'attack')
  const g2 = ref.view(b, third)
  assert.deepEqual([g2.last.players[2].taken.kind, g2.me.guarded], ['blocked', false], 'guard used up after one round')
  console.log('duel referee OK')
}
