/**
 * Damage rules of the 1v1 duel. Each round both players secretly pick an action and a question level,
 * then answer that question. Attack beats armor break, armor break beats defend, defend beats attack.
 * A wrong or missing answer does nothing; the slower the pick and the answer, the weaker the move.
 */
export class DuelRules {
  static MAX_HP = 100
  static ACTIONS = ['attack', 'break', 'defend']
  static CHOOSE_SECONDS = 15
  static ANSWER_SECONDS = { easy: 20, medium: 35, hard: 50 }
  static POWER = { easy: 12, medium: 20, hard: 30 }
  static BLOCK = { easy: 0.5, medium: 0.65, hard: 0.8 } // share of an attack that a correct defend stops
  static BREAK_RATIO = 0.6 // armor break hits weaker than attack but ignores defend
  static MIN_SPEED = 0.35

  /** 1 for an instant pick and answer, falling to MIN_SPEED at the last allowed moment. */
  static speed(move) {
    const window = (DuelRules.CHOOSE_SECONDS + DuelRules.ANSWER_SECONDS[move.level]) * 1000
    const used = Math.min(Math.max(move.answeredMs / window, 0), 1)
    return 1 - (1 - DuelRules.MIN_SPEED) * used
  }

  /** What `attacker`'s move does to `defender`: { damage, kind: 'hit' | 'blocked' | 'pierced' | 'miss' | 'none' }. */
  static hit(attacker, defender) {
    if (!attacker || attacker.action === 'defend') return { damage: 0, kind: 'none' }
    if (!attacker.correct) return { damage: 0, kind: 'miss' }
    const power = DuelRules.POWER[attacker.level] * DuelRules.speed(attacker)
    if (attacker.action === 'break') return { damage: Math.round(power * DuelRules.BREAK_RATIO), kind: 'pierced' }
    const guarding = defender?.action === 'defend' && defender.correct
    const block = guarding ? DuelRules.BLOCK[defender.level] * DuelRules.speed(defender) : 0
    return { damage: Math.round(power * (1 - block)), kind: guarding ? 'blocked' : 'hit' }
  }

  /** One round: what each side takes. Moves are { action, level, correct, answeredMs } or null (did nothing). */
  static resolve(moveA, moveB) {
    return { a: DuelRules.hit(moveB, moveA), b: DuelRules.hit(moveA, moveB) }
  }
}
