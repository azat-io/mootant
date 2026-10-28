import type { MutantResult } from '../../types/run/mutant-result'

/**
 * Names a mutant for a readable comparison.
 *
 * @param result - Verdict of a mutant.
 * @returns File, mutator and replacement of the mutant.
 */
export function describeMutant(result: MutantResult): string {
  return [
    result.mutant.file,
    result.mutant.mutator,
    result.mutant.replacement.replaceAll(/\s+/gu, ' '),
  ].join(' | ')
}
