import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

/**
 * Mutator context with the test that decides whether a mutant justifies
 * skipping a candidate. The shared plans take it, so one rule serves both the
 * redundancy skips and the static ownership checks.
 */
export interface RunContext extends MutatorContext {
  /**
   * Tells whether a mutant counts as running when it justifies skipping a
   * candidate.
   *
   * @param justifier - Mutant that would make the candidate redundant.
   * @param candidate - Mutant whose skip is decided.
   * @returns Whether the justifying mutant counts.
   */
  runs(justifier: MutantSite, candidate: MutantSite): boolean
}

/**
 * Mutant named by its mutator and the node it replaces.
 */
export interface MutantSite {
  /**
   * Id of the mutator.
   */
  mutator: string

  /**
   * Node the mutant replaces.
   */
  node: Node
}

/**
 * Adds the test of the redundancy rules to a mutator context (catalog 2.7): a
 * justifying mutant counts when it will run, or when its mutator is enabled and
 * the candidate itself is ignored, so that an ignore comment never adds or
 * removes an ignored entry.
 *
 * @param context - Mutator context of the file.
 * @returns The context with the test of mutants that will run.
 */
export function createRunContext(context: MutatorContext): RunContext {
  return {
    ...context,
    runs(justifier: MutantSite, candidate: MutantSite): boolean {
      return (
        context.isActive(justifier.mutator, justifier.node) ||
        (context.isEnabled(justifier.mutator) &&
          !context.isActive(candidate.mutator, candidate.node))
      )
    },
  }
}
