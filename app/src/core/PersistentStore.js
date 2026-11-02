const SAVE_DELAY_MS = 1500 // batches bursts (video position ticks, flashcard grading) into one save

/**
 * A small observable state container whose changes are handed to `persist`, debounced.
 * `get` and `subscribe` match React's useSyncExternalStore contract.
 */
export class PersistentStore {
  #listeners = new Set()
  #timer = 0
  #dirty = false

  constructor(defaults, initial, persist) {
    this.state = { ...defaults, ...initial }
    this.persist = persist
  }

  get = () => this.state

  subscribe = (listener) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Replace one top-level slice with `recipe(currentSlice)`. */
  update(slice, recipe) {
    this.state = { ...this.state, [slice]: recipe(this.state[slice]) }
    this.#dirty = true
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => this.flush(), SAVE_DELAY_MS)
    this.#listeners.forEach((listener) => listener())
  }

  /** Save pending changes now; `beacon` is for page unload, when a normal request may be cut off. */
  flush(beacon = false) {
    clearTimeout(this.#timer)
    if (!this.#dirty) return Promise.resolve()
    this.#dirty = false
    // a failed save stays pending and goes out with the next change
    return Promise.resolve(this.persist(this.state, beacon)).catch(() => {
      this.#dirty = true
    })
  }
}
