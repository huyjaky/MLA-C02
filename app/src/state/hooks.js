import { useEffect, useReducer, useRef, useState } from 'react'

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

/** Re-render every `ms` while `active`, for clocks and countdowns. */
export function useTicker(ms, active = true) {
  const [, tick] = useReducer((n) => n + 1, 0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(tick, ms)
    return () => clearInterval(timer)
  }, [ms, active])
}

/** Calls the latest `fn` now and every `ms` while `active`, without restarting the timer when `fn` changes. */
export function usePoll(fn, ms, active = true) {
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => {
    if (!active) return
    latest.current()
    const timer = setInterval(() => latest.current(), ms)
    return () => clearInterval(timer)
  }, [ms, active])
}

/**
 * Page-wide keyboard shortcuts. Typing in `ignore` elements and modifier chords never trigger them;
 * `handle(event)` returns true when it used the key, which then loses its default action.
 */
export function useHotkeys(handle, ignore = 'input, select, textarea') {
  const latest = useRef(handle)
  latest.current = handle
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.(ignore)) return
      if (latest.current(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ignore])
}

/** Result of `load()`, null while it runs; a load started for older `deps` never overwrites a newer one. */
export function useAsync(load, deps) {
  const [value, setValue] = useState(null)
  useEffect(() => {
    let live = true
    setValue(null)
    load().then((v) => live && setValue(v))
    return () => {
      live = false
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return value
}
