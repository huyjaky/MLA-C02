// Assert-based self-check for the study API over real HTTP (in-memory DB): `npm run check`
import assert from 'node:assert/strict'
import http from 'node:http'
import { studyApi } from '../server/StudyApi.js'

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

  console.log('selfcheck-api OK')
} finally {
  server.close()
}
