import type { MutantSummary } from './run-mutator'

/**
 * Formats a mutant as its original text and its replacement.
 *
 * @param mutant - Mutant of a test run.
 * @returns The original and the replacement, joined by an arrow.
 */
export function formatMutant(
  mutant: Pick<MutantSummary, 'replacement' | 'original'>,
): string {
  return `${mutant.original} -> ${mutant.replacement}`
}
