import type { TextEdit } from '../../types/source/text-edit'

/**
 * Copies the focus of a replacement or candidate as an object to spread, so an
 * entry without one gets no `focus` key.
 *
 * @param entry - Replacement, candidate or mutant.
 * @param entry.focus - Edit that reports show, if any.
 * @returns An object with the focus, or an empty object.
 */
export function pickFocus(entry: { focus?: TextEdit }): { focus?: TextEdit } {
  return entry.focus ? { focus: entry.focus } : {}
}
