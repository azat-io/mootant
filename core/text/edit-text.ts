import type { Node } from 'oxc-parser'

import type { ParsedFile } from '../../types/parsed-file'
import type { TextEdit } from '../../types/text-edit'

import { needsSeparator } from './needs-separator'

/**
 * Builds the text of a node with edits applied. Edits are applied in the order
 * of their start offsets, and a space is inserted at every junction where the
 * edited text would merge with the text next to it into a different token:
 * `1?.x` with `?.` replaced by `.` gives `1 .x`.
 *
 * @param parsed - File the node belongs to.
 * @param node - Node whose text is edited.
 * @param edits - Replacements of ranges inside the node; they must not overlap.
 * @returns Text of the node with every edit applied.
 * @throws RangeError - When an edit lies outside the node, ends before it
 *   starts or overlaps another edit.
 */
export function editText(
  parsed: ParsedFile,
  node: Node,
  edits: readonly TextEdit[],
): string {
  let { text } = parsed
  let result = ''
  let cursor = node.start
  let sorted = edits.toSorted((left, right) => left.start - right.start)
  for (let edit of sorted) {
    if (edit.start < cursor || edit.start > edit.end || edit.end > node.end) {
      throw new RangeError(
        'Edits must lie inside the node and must not overlap.',
      )
    }

    result += text.slice(cursor, edit.start)
    let following = text.slice(edit.end, node.end)
    let inserted = edit.text
    if (needsSeparator(result, inserted || following)) {
      inserted = ` ${inserted}`
    }
    if (needsSeparator(inserted, following)) {
      inserted = `${inserted} `
    }
    result += inserted
    cursor = edit.end
  }
  return result + text.slice(cursor, node.end)
}
