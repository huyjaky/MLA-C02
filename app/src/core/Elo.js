/**
 * Elo ratings for duels, one rating per mode. A team plays at its members' average rating, and every member
 * moves by the team's change, so beating a stronger team pays more than beating a weaker one.
 */
export class Elo {
  static START = 1000
  static K = 32

  /** Chance (0..1) that `rating` beats `opponent`. */
  static expected(rating, opponent) {
    return 1 / (1 + 10 ** ((opponent - rating) / 400))
  }

  /**
   * New ratings after a match. `teams`: { A: [{ id, rating }], B: [...] }; `winner`: 'A' | 'B' | null (draw).
   * Returns { [id]: { before, after, delta } }; the two teams' changes always cancel out.
   */
  static update(teams, winner) {
    const average = (members) => members.reduce((sum, m) => sum + m.rating, 0) / members.length
    const score = winner == null ? 0.5 : winner === 'A' ? 1 : 0
    const deltaA = Math.round(Elo.K * (score - Elo.expected(average(teams.A), average(teams.B))))
    const change = { A: deltaA, B: -deltaA }
    return Object.fromEntries(
      Object.entries(teams).flatMap(([team, members]) =>
        members.map((m) => [m.id, { before: m.rating, after: m.rating + change[team], delta: change[team] }]),
      ),
    )
  }
}
