import type { MutatorSetup } from './generate-candidates'

import { generateCandidates } from './generate-candidates'
import { applyMutant } from './apply-mutant'

/**
 * Runs the whole pipeline with every built-in mutator over a snippet and
 * applies each mutant of one mutator to it the way the mutant switch hosts it,
 * so a removal reads as the snippet without the element. With `skipped`, the
 * skipped candidates of the mutator are applied instead, each followed by its
 * category and rule. Svelte and Vue templates are read with the compilers of
 * the repository unless the `templates` setting is off.
 *
 * @param id - Id of the mutator whose mutants are applied.
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run, and whether to apply the skipped candidates.
 * @returns The snippet with each mutant applied, in canonical order.
 * @throws Error - When the snippet does not parse or a mutator fails.
 */
export function listMutatedSources(
  id: string,
  source: string,
  setup: { skipped?: boolean } & MutatorSetup = {},
): string[] {
  let { skipped, mutants } = generateCandidates(source, setup)
  if (!setup.skipped) {
    return mutants
      .filter(mutant => mutant.mutator === id)
      .map(mutant => applyMutant(source, mutant))
  }
  return skipped
    .filter(candidate => candidate.mutator === id)
    .map(
      candidate =>
        `${applyMutant(source, { ...candidate, kind: candidate.kind! })} (${candidate.category} ${candidate.rule})`,
    )
}
