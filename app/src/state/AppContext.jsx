import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react'
import { ContentRepository } from '../core/ContentRepository'
import { ProgressTracker } from '../core/ProgressTracker'
import { Localizer } from '../core/Localizer'
import { ApiClient } from '../core/ApiClient'
import { AuthPage } from '../pages/AuthPage'

const repo = new ContentRepository()
const api = new ApiClient()
const AppContext = createContext(null)

/** Gate: sign in or register first, then load that account's own progress. */
export function AppProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading' })

  const start = useCallback(async ({ user }) => {
    const { state } = await api.loadProgress()
    const persist = (snapshot, beacon) => (beacon ? api.beaconProgress(snapshot) : api.saveProgress(snapshot))
    setSession({ status: 'ready', user, tracker: new ProgressTracker(state ?? {}, persist) })
  }, [])

  useEffect(() => {
    api.me().then(start).catch(() => setSession({ status: 'anon' }))
  }, [start])

  const auth = useMemo(
    () => ({
      login: async (username, password) => start(await api.login(username, password)),
      register: async (username, password) => start(await api.register(username, password)),
      logout: async () => {
        await session.tracker?.flush()
        await api.logout().catch(() => {})
        setSession({ status: 'anon' })
      },
    }),
    [start, session.tracker],
  )

  if (session.status === 'loading') return null
  if (session.status === 'anon') return <AuthPage auth={auth} dictionaries={repo.dictionaries} />
  return (
    <SignedIn user={session.user} tracker={session.tracker} logout={auth.logout}>
      {children}
    </SignedIn>
  )
}

function SignedIn({ user, tracker, logout, children }) {
  const state = useSyncExternalStore(tracker.subscribe, tracker.get)
  const { lang, theme } = state.settings
  const l = useMemo(() => new Localizer(lang, repo.dictionaries), [lang])

  useEffect(() => {
    document.documentElement.lang = lang
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [lang, theme])

  // closing the tab: send whatever is still waiting for its debounced save
  useEffect(() => {
    const flush = () => tracker.flush(true)
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [tracker])

  const value = useMemo(() => ({ repo, tracker, state, l, user, logout }), [tracker, state, l, user, logout])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** { repo, tracker, state, l, user, logout } — content, progress actions and snapshot, localizer, account. */
export const useApp = () => useContext(AppContext)

/** Holds a mutable domain object (e.g. QuizSession) and re-renders after `commit`. */
export function useMutable(factory) {
  const [object] = useState(factory)
  const [, bump] = useReducer((n) => n + 1, 0)
  const commit = (fn) => {
    const result = fn?.(object)
    bump()
    return result
  }
  return [object, commit]
}
