import type { MutantKind } from '../../types/mutant/mutant-kind'
import type { TextEdit } from '../../types/source/text-edit'

/**
 * Tells where a mutant, a candidate or a skipped candidate is placed: at its
 * removed element or member when it removes one from an array or object
 * literal, since its range may start at the comma after the element before, and
 * at the start of its range otherwise. Ignore directives cover it there, and a
 * skip that it justifies names it there.
 *
 * @param entry - Mutant, candidate or skipped candidate, with its kind and with
 *   its focus, which every removal of an element or a member has.
 * @returns Offset where it is placed.
 */
export function getMutantSite(entry: {
  kind: MutantKind | null
  focus?: TextEdit
  start: number
}): number {
  return entry.kind === 'element' || entry.kind === 'property' ?
      entry.focus!.start
    : entry.start
}
