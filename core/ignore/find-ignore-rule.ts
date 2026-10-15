import type { IgnoreRule } from '../../types/mutant/ignore-rule'

/**
 * Mutant, or node about to be mutated, whose ignore rule is looked up.
 */
interface IgnoreTarget {
  /**
   * Full id of the mutator.
   */
  mutator: string

  /**
   * Start offset of the replaced node.
   */
  start: number

  /**
   * 1-based line of the start offset.
   */
  line: number
}

/**
 * Precedence of the rule kinds: the most specific kind wins.
 */
let kindPrecedence: Record<IgnoreRule['kind'], number> = {
  'next-line': 3,
  region: 2,
  file: 1,
}

/**
 * Finds the rule that decides whether a mutant is ignored. A rule applies when
 * it lists the mutant's mutator or every mutator, and covers the mutant's
 * start: its line for a next-line rule, its offset for a region or file rule.
 * Among applicable rules a next-line rule beats a region, a region beats a file
 * rule, and within a kind the later directive wins.
 *
 * @param rules - Ignore rules of the file.
 * @param target - Mutator id, start offset and start line of the mutant.
 * @returns The winning rule, or null when no rule applies and the mutant runs.
 */
export function findIgnoreRule(
  rules: readonly IgnoreRule[],
  target: IgnoreTarget,
): IgnoreRule | null {
  let winner: IgnoreRule | null = null
  for (let rule of rules) {
    if (appliesTo(rule, target) && (!winner || isPreferred(rule, winner))) {
      winner = rule
    }
  }
  return winner
}

/**
 * Tells whether a rule covers a mutant.
 *
 * @param rule - Rule of the file.
 * @param target - Mutant to check.
 * @returns Whether the rule names the mutator and covers the mutant's start.
 */
function appliesTo(rule: IgnoreRule, target: IgnoreTarget): boolean {
  if (rule.mutators !== null && !rule.mutators.includes(target.mutator)) {
    return false
  }
  if (rule.kind === 'next-line') {
    return rule.line === target.line
  }
  return rule.start <= target.start && target.start < rule.end
}

/**
 * Tells whether a rule takes precedence over the best rule found so far.
 *
 * @param rule - Applicable rule.
 * @param winner - Best applicable rule so far.
 * @returns Whether the rule has a more specific kind, or the same kind and a
 *   later directive.
 */
function isPreferred(rule: IgnoreRule, winner: IgnoreRule): boolean {
  let precedence = kindPrecedence[rule.kind]
  let winnerPrecedence = kindPrecedence[winner.kind]
  return (
    precedence > winnerPrecedence ||
    (precedence === winnerPrecedence && rule.order > winner.order)
  )
}
