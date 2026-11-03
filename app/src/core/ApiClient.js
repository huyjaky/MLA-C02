class ApiError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}

/** JSON client for the local study API; the session travels in an HttpOnly cookie. */
export class ApiClient {
  async request(method, path, body) {
    let response
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new ApiError(0, 'network')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new ApiError(response.status, data.error ?? 'server_error')
    return data
  }

  me = () => this.request('GET', '/me')
  login = (username, password) => this.request('POST', '/login', { username, password })
  register = (username, password) => this.request('POST', '/register', { username, password })
  logout = () => this.request('POST', '/logout')
  loadProgress = () => this.request('GET', '/progress')
  saveProgress = (state) => this.request('POST', '/progress', { state })
  leaderboards = () => this.request('GET', '/leaderboards')
  saveSurvival = (result) => this.request('POST', '/games/survival', result)
  /** Duel calls: presence, challenge, respond, match, move, answer, leave. */
  arena = (action, body = {}) => this.request('POST', `/arena/${action}`, body)

  /** Last-chance save while the tab closes; text/plain keeps sendBeacon from refusing the body. */
  beaconProgress(state) {
    navigator.sendBeacon('/api/progress', new Blob([JSON.stringify({ state })], { type: 'text/plain' }))
  }
}
