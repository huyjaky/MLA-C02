/**
 * Damage rules of the 1v1 duel. Each round both players secretly pick an action and a question level,
 * then answer that question. A correct defend raises a guard for the NEXT round that cuts attacks by 80%;
 * armor break hits weaker than attack but goes straight through a guard.
 * A wrong or missing answer does nothing; the slower the pick and the answer, the weaker the move.
 */
export class DuelRules {
  static MAX_HP = 100
  static ACTIONS = ['attack', 'break', 'defend']
  static CHOOSE_SECONDS = 15
  static ANSWER_SECONDS = { easy: 20, medium: 35, hard: 50 }
  static POWER = { easy: 12, medium: 20, hard: 30 }
  static GUARD = 0.8 // share of an attack that the guard from last round's correct defend stops
  static BREAK_RATIO = 0.6 // armor break hits weaker than attack but ignores the guard
  static MIN_SPEED = 0.35

  /** 1 for an instant pick and answer, falling to MIN_SPEED at the last allowed moment. */
  static speed(move) {
    const window = (DuelRules.CHOOSE_SECONDS + DuelRules.ANSWER_SECONDS[move.level]) * 1000
    const used = Math.min(Math.max(move.answeredMs / window, 0), 1)
    return 1 - (1 - DuelRules.MIN_SPEED) * used
  }

  /**
   * What `attacker`'s move does to a defender who is (or is not) `guarded` this round:
   * { damage, kind: 'hit' | 'blocked' | 'pierced' | 'miss' | 'none' }.
   */
  static hit(attacker, guarded = false) {
    if (!attacker || attacker.action === 'defend') return { damage: 0, kind: 'none' }
    if (!attacker.correct) return { damage: 0, kind: 'miss' }
    const power = DuelRules.POWER[attacker.level] * DuelRules.speed(attacker)
    if (attacker.action === 'break') return { damage: Math.round(power * DuelRules.BREAK_RATIO), kind: guarded ? 'pierced' : 'hit' }
    return guarded ? { damage: Math.round(power * (1 - DuelRules.GUARD)), kind: 'blocked' } : { damage: Math.round(power), kind: 'hit' }
  }

  /** A correct defend this round guards its player next round. */
  static guards(move) {
    return move?.action === 'defend' && Boolean(move.correct)
  }

  /** 'win' | 'loss' | 'draw' for player `id`; `winner` is a user id, or null for a draw. */
  static outcomeFor(winner, id) {
    return winner == null ? 'draw' : winner === id ? 'win' : 'loss'
  }

  /**
   * One round: what each side takes and who is guarded next round. Moves are { action, level, correct, answeredMs }
   * or null (did nothing); `guarded` says who earned a guard last round.
   */
  static resolve(moveA, moveB, guarded = { a: false, b: false }) {
    return {
      a: DuelRules.hit(moveB, guarded.a),
      b: DuelRules.hit(moveA, guarded.b),
      next: { a: DuelRules.guards(moveA), b: DuelRules.guards(moveB) },
    }
  }
}
