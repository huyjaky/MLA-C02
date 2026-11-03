/**
 * Rules of the duel, for 1v1 and 2v2. Each round every fighter still standing secretly picks an action,
 * a question level and (in 2v2) a target, then answers that question. A wrong or missing answer does nothing;
 * the slower the pick and the answer, the weaker the move.
 *
 * - attack: full damage. Against a guard only 20% gets through.
 * - break: 60% damage, the guard stops only 40% of it, and it interrupts the target's defend or buff this round.
 * - defend: guards the target (self or teammate) next round.
 * - buff: the target's (self or teammate) moves hit 1.5x harder next round.
 * Guards and buffs last one round and are visible to everyone, so a guarded opponent invites a buff,
 * a buff invites a break, and a break is weak into an attack.
 */
export class DuelRules {
  static MAX_HP = 100
  static ACTIONS = ['attack', 'break', 'defend', 'buff']
  static ROUND_OPTIONS = [3, 6, 9, 12]
  static TEAM_SIZE = { '1v1': 1, '2v2': 2 }
  static CHOOSE_SECONDS = 15
  static ANSWER_SECONDS = { easy: 20, medium: 35, hard: 50 }
  static POWER = { easy: 10, medium: 16, hard: 24 }
  static BREAK_RATIO = 0.6
  static GUARD = { attack: 0.8, break: 0.4 } // share of each move a guard stops
  static BUFF = 1.5
  static MIN_SPEED = 0.35

  /** Attack and break aim at an enemy; defend and buff at yourself or a teammate. */
  static targetsEnemy(action) {
    return action === 'attack' || action === 'break'
  }

  /** 1 for an instant pick and answer, falling to MIN_SPEED at the last allowed moment. */
  static speed(move) {
    const window = (DuelRules.CHOOSE_SECONDS + DuelRules.ANSWER_SECONDS[move.level]) * 1000
    const used = Math.min(Math.max(move.answeredMs / window, 0), 1)
    return 1 - (1 - DuelRules.MIN_SPEED) * used
  }

  /** Who a move lands on: the requested target if it is valid and standing, else the first valid one. */
  static aim(fighters, actor, move) {
    const valid = fighters.filter((f) => f.hp > 0 && (DuelRules.targetsEnemy(move.action) ? f.team !== actor.team : f.team === actor.team))
    return valid.find((f) => f.id === move.target) ?? (DuelRules.targetsEnemy(move.action) ? valid[0] : actor)
  }

  /**
   * One round. `fighters`: [{ id, team, hp, guarded, buffed }] as the round starts; `moves`: { [id]: { action, level,
   * target, correct, answeredMs } } (a missing move did nothing). Fighters knocked out this round still act this round.
   * Returns { hits: [{ from, to, action, damage, kind }], hp: { id: hp }, next: { id: { guarded, buffed } } },
   * kind being 'hit' | 'blocked' (attack into a guard) | 'pierced' (break into a guard) | 'miss' (wrong answer)
   * | 'support' (defend/buff landed) | 'interrupted' (defend/buff broken by a break).
   */
  static resolveRound(fighters, moves) {
    const plays = fighters
      .filter((f) => f.hp > 0 && moves[f.id])
      .map((actor) => ({ actor, move: moves[actor.id], target: DuelRules.aim(fighters, actor, moves[actor.id]) }))
      .filter((p) => p.target)
    const interrupted = new Set(plays.filter((p) => p.move.action === 'break' && p.move.correct).map((p) => p.target.id))
    const hits = []
    const damage = new Map()
    const next = Object.fromEntries(fighters.map((f) => [f.id, { guarded: false, buffed: false }]))

    for (const { actor, move, target } of plays) {
      const hit = { from: actor.id, to: target.id, action: move.action, damage: 0 }
      if (!move.correct) hits.push({ ...hit, kind: 'miss' })
      else if (DuelRules.targetsEnemy(move.action)) {
        const ratio = move.action === 'break' ? DuelRules.BREAK_RATIO : 1
        const guard = target.guarded ? DuelRules.GUARD[move.action] : 0
        const amount = Math.round(DuelRules.POWER[move.level] * DuelRules.speed(move) * ratio * (actor.buffed ? DuelRules.BUFF : 1) * (1 - guard))
        damage.set(target.id, (damage.get(target.id) ?? 0) + amount)
        hits.push({ ...hit, damage: amount, kind: !target.guarded ? 'hit' : move.action === 'break' ? 'pierced' : 'blocked' })
      } else if (interrupted.has(actor.id)) hits.push({ ...hit, kind: 'interrupted' })
      else {
        next[target.id][move.action === 'defend' ? 'guarded' : 'buffed'] = true
        hits.push({ ...hit, kind: 'support' })
      }
    }

    const hp = Object.fromEntries(fighters.map((f) => [f.id, Math.max(0, f.hp - (damage.get(f.id) ?? 0))]))
    for (const f of fighters) if (hp[f.id] === 0) next[f.id] = { guarded: false, buffed: false }
    return { hits, hp, next }
  }

  /** Winning team ('A' | 'B'), null for a draw, undefined while both teams stand and rounds remain. */
  static winner(fighters, roundsLeft) {
    const standing = (team) => fighters.some((f) => f.team === team && f.hp > 0)
    const [a, b] = [standing('A'), standing('B')]
    if (a && b && roundsLeft > 0) return undefined
    if (a !== b) return a ? 'A' : 'B'
    const total = (team) => fighters.filter((f) => f.team === team).reduce((sum, f) => sum + f.hp, 0)
    const [ta, tb] = [total('A'), total('B')]
    return ta === tb ? null : ta > tb ? 'A' : 'B'
  }

  /** 'win' | 'loss' | 'draw' for a player on `team`; `winner` is a team, or null for a draw. */
  static outcomeFor(winner, team) {
    return winner == null ? 'draw' : winner === team ? 'win' : 'loss'
  }
}
