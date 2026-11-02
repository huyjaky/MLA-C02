const DAY = 86_400_000

/**
 * Five-box Leitner system. Box 0 means "never studied".
 * Knowing a card moves it up one box (a new card known at first sight skips to box 2);
 * missing it sends it back to box 1, which stays due until it is known.
 */
export class LeitnerScheduler {
  static BOXES = 5
  static INTERVAL_DAYS = [0, 0, 1, 3, 7, 14]

  constructor(records = {}) {
    this.records = records
  }

  box(cardId) {
    return this.records[cardId]?.box ?? 0
  }

  isDue(cardId, now = Date.now()) {
    return (this.records[cardId]?.due ?? 0) <= now
  }

  /** New record for a card after one review. */
  static review(record, known, now = Date.now()) {
    const box = known ? Math.min(Math.max((record?.box ?? 0) + 1, 2), LeitnerScheduler.BOXES) : 1
    return { box, due: now + LeitnerScheduler.INTERVAL_DAYS[box] * DAY }
  }

  /** Due cards, lowest box first so weak cards come up before strong ones. */
  queue(cards, now = Date.now()) {
    return cards
      .filter((card) => this.isDue(card.id, now))
      .sort((a, b) => this.box(a.id) - this.box(b.id))
  }

  /** Card count per box, index 0 = new. */
  counts(cards) {
    const counts = Array(LeitnerScheduler.BOXES + 1).fill(0)
    cards.forEach((card) => counts[this.box(card.id)]++)
    return counts
  }
}
