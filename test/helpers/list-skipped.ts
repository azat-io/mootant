import type { MutatorSetup } from './generate-candidates'

import { generateCandidates } from './generate-candidates'

/**
 * Runs the whole pipeline with every built-in mutator over a snippet, as
 * `mootant list --skipped` would, and describes the skipped candidates of one
 * mutator as `original -> replacement (category rule)`. Svelte and Vue
 * templates are read with the compilers of the repository unless the
 * `templates` setting is off.
 *
 * @param id - Id of the mutator whose skipped candidates are returned.
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run.
 * @returns Skipped candidates of the mutator in canonical order.
 * @throws Error - When the snippet does not parse or a mutator fails.
 */
export function listSkipped(
  id: string,
  source: string,
  setup: MutatorSetup = {},
): string[] {
  let { skipped } = generateCandidates(source, setup)
  return skipped
    .filter(candidate => candidate.mutator === id)
    .map(
      candidate =>
        `${source.slice(candidate.start, candidate.end)} -> ${candidate.replacement} (${candidate.category} ${candidate.rule})`,
    )
}
