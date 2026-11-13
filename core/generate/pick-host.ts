import type { MutantHost } from '../../types/mutant/mutant-host'

import { pickFocus } from './pick-focus'

/**
 * Copies how a candidate or a mutant is hosted: its kind with its focus and,
 * for the removal of an element or a member, its literal. An entry without a
 * focus gets no `focus` key.
 *
 * @param entry - Candidate or mutant.
 * @returns Its kind, focus and literal.
 */
export function pickHost(entry: MutantHost): MutantHost {
  if (entry.kind === 'element' || entry.kind === 'property') {
    let { focus, kind, list } = entry
    return { focus, kind, list }
  }
  return { kind: entry.kind, ...pickFocus(entry) }
}
