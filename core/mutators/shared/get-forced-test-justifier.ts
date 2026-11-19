import type { MutantSite, RunContext } from './create-run-context'
import type { DirectionQuery } from './has-polar-mutant'

import { isEffectFree } from '../../syntax/is-effect-free'
import { getOwnerConstant } from './get-owner-constant'
import { getTowardMutant } from './get-toward-mutant'
import { isReadOnly } from './is-read-only'

/**
 * Mutant that makes a candidate redundant, with what its skip rests on.
 */
interface ForcedTestJustifier {
  /**
   * Whether the skip rests on the guess that the calls of the decision only
   * read values.
   */
  heuristic: boolean

  /**
   * Whether the mutant is the constant of the decision's owner (O19) rather
   * than a mutant that moves the decision toward the value (R4, R5).
   */
  owned: boolean

  /**
   * The mutant.
   */
  by: MutantSite
}

/**
 * Finds the mutant that makes redundant a candidate that acts like a decision
 * forced to a truth value while the decision still runs, such as the removal of
 * a then-branch or a copy of the other branch (catalog 5.2 O19, 5.3 R4 and R5).
 * The constant of the decision's owner (see `getOwnerConstant`) skips every
 * effect of the decision, so it counts only for a decision without effects (see
 * `isEffectFree`). Otherwise a mutant that will run and moves the decision
 * toward the value counts when it evaluates every part of the decision with an
 * effect as the decision does (see `getTowardMutant`). A decision whose only
 * effects are calls of well-known read-only methods (see `isReadOnly`) counts
 * as one without effects too: the owner's constant then rests on that guess,
 * and so does a mutant that moves the decision unless it evaluates every such
 * call as the decision does.
 *
 * @param query - Candidate, decision and forced value.
 * @param context - Mutator context with the test of mutants that will run.
 * @param ownable - Whether the owner's constant may make the candidate
 *   redundant.
 * @returns The mutant, whether it is the owner's constant and whether the skip
 *   rests on the guess, or null when the candidate is emitted.
 */
export function getForcedTestJustifier(
  query: DirectionQuery,
  context: RunContext,
  ownable: boolean,
): ForcedTestJustifier | null {
  let { decision, value } = query
  let free = isEffectFree(decision)
  let guessed = !free && isReadOnly(decision, context)
  let owner =
    ownable && (free || guessed) ?
      getOwnerConstant(decision, value, context)
    : null
  if (owner) {
    return { heuristic: guessed, owned: true, by: owner }
  }
  let exact = getTowardMutant(query, context, true)
  if (exact) {
    return { heuristic: false, owned: false, by: exact }
  }
  let toward = guessed ? getTowardMutant(query, context) : null
  return toward && { heuristic: true, owned: false, by: toward }
}
