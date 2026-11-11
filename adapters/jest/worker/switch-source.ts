import type { SwitchedFile } from '../../../types/adapter/switched-file'

import { resolveSwitchedText } from '../../../core/instrument/resolve-switched-text'

/**
 * Picks the text of a module for a transformer. Jest strips a shebang from what
 * it hands a transformer and leaves the empty line, so the texts of the plan
 * are compared and served the same way.
 *
 * @param entry - Switched file of the module, if the plan has it.
 * @param source - Text Jest handed over.
 * @returns The text to transform and what happened to it: `served` for the
 *   switched text, `mismatched` for a text that differs from the one mootant
 *   listed mutants from, null for a file the plan does not have.
 */
export function switchSource(
  entry: SwitchedFile | undefined,
  source: string,
): { kind: 'mismatched' | 'served' | null; text: string } {
  if (entry === undefined) {
    return { text: source, kind: null }
  }
  let text = resolveSwitchedText(
    {
      ...entry,
      original: stripShebang(entry.original),
      switched: stripShebang(entry.switched),
    },
    source,
  )
  return text === null ?
      { kind: 'mismatched', text: source }
    : { kind: 'served', text }
}

/**
 * Removes a shebang the way Jest does.
 *
 * @param text - Text of a module.
 * @returns The text with the first line empty when it was a shebang.
 */
function stripShebang(text: string): string {
  return text.startsWith('#!') ? text.replace(/^#!.*/u, '') : text
}
