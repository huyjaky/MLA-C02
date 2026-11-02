/** Subtitle cues ([start, end, text]) with fast lookup by playback time. */
export class TranscriptTrack {
  static GAP_TOLERANCE = 0.4 // keep a cue visible across tiny gaps between cues

  constructor(cues = []) {
    this.cues = cues
  }

  get isEmpty() {
    return this.cues.length === 0
  }

  /** Index of the cue playing at `time`, or -1. Binary search: tracks have ~500 cues. */
  indexAt(time) {
    let lo = 0
    let hi = this.cues.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.cues[mid][0] <= time) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found >= 0 && time <= this.cues[found][1] + TranscriptTrack.GAP_TOLERANCE ? found : -1
  }

  textAt(time) {
    const i = this.indexAt(time)
    return i < 0 ? '' : this.cues[i][2]
  }
}
