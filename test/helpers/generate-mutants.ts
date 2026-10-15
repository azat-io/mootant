import type { MutatorSetup } from './generate-candidates'
import type { Mutant } from '../../types/mutant/mutant'

import { generateCandidates } from './generate-candidates'

/**
 * Runs the whole pipeline with every built-in mutator over a snippet, as
 * `mootant list` would, and returns every mutant of the run. Unlike
 * `runMutator`, the mutants keep their offsets and are not filtered by mutator,
 * so a property test can apply and execute each of them.
 *
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run.
 * @returns Mutants of the snippet in canonical order.
 * @throws Error - When the snippet does not parse or a mutator fails.
 */
export function generateMutants(
  source: string,
  setup: MutatorSetup = {},
): Mutant[] {
  return generateCandidates(source, setup).mutants
}
