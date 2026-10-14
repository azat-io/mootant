import type { MutatorSetup } from './generate-mutants'

import { formatMutant } from './format-mutant'
import { runMutator } from './run-mutator'

/**
 * Lists the mutants of one mutator on a snippet as `original -> replacement`.
 *
 * @param id - Id of the mutator whose mutants are listed.
 * @param lines - Lines of the snippet, joined with line feeds.
 * @param setup - Preset, settings and file name of the run.
 * @returns The mutants in canonical order.
 */
export function listMutantTexts(
  id: string,
  lines: string[],
  setup?: MutatorSetup,
): string[] {
  return runMutator(id, lines.join('\n'), setup).map(formatMutant)
}
