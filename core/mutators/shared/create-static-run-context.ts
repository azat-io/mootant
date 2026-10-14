import type { MutatorContext } from '../../../types/mutator-context'
import type { RunContext } from './create-run-context'

/**
 * Adds a test to a mutator context under which every mutant counts as running
 * (catalog 5.2, O19): an ownership skip is judged with every mutator enabled
 * and without ignore comments, so it never depends on the preset or on
 * comments.
 *
 * @param context - Mutator context of the file.
 * @returns The context with a test that always holds.
 */
export function createStaticRunContext(context: MutatorContext): RunContext {
  return {
    ...context,
    runs(): boolean {
      return true
    },
  }
}
