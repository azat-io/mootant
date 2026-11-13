import type { MutantHost } from '../../types/mutant/mutant-host'

/**
 * Tells where a mutant or a candidate is placed: at its removed element or
 * member when it removes one from an array or object literal, since its range
 * may start at the comma after the element before, and at the start of its
 * range otherwise. Ignore directives cover it there, and a skip that it
 * justifies names it there.
 *
 * @param entry - Mutant or candidate with how it is hosted.
 * @returns Offset where it is placed.
 */
export function getMutantSite(entry: { start: number } & MutantHost): number {
  return entry.kind === 'element' || entry.kind === 'property' ?
      entry.focus.start
    : entry.start
}
