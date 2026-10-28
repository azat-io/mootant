import type { TextStyle } from '../../types/cli/text-style'

import { cutToWidth } from './cut-to-width'
import { getSymbols } from './get-symbols'

/**
 * How entries are grouped by file and printed under it.
 */
interface FileLayout<Entry> {
  /**
   * Formats the entries of one file.
   *
   * @param entries - Entries of the file, in the order to print.
   * @returns Lines of the group without its heading.
   */
  formatGroup(entries: readonly Entry[]): string

  /**
   * Finds the file of an entry.
   *
   * @param entry - Entry to print.
   * @returns Path of the file, the heading of its group.
   */
  getFile(entry: Entry): string

  /**
   * Colors, width and symbols of the output.
   */
  style: TextStyle
}

/**
 * Formats entries grouped by file: the path in bold, cut from its start when
 * wider than the line, then the lines of its entries. Files keep the order
 * their first entry has.
 *
 * @param entries - Entries in the order to print.
 * @param layout - File of an entry, lines of a group and style of the output.
 * @returns Groups separated by an empty line, or an empty text without entries.
 */
export function formatByFile<Entry>(
  entries: readonly Entry[],
  layout: FileLayout<Entry>,
): string {
  let { style } = layout
  let { ellipsis } = getSymbols(style.unicode)
  let groups = new Map<string, Entry[]>()
  for (let entry of entries) {
    let file = layout.getFile(entry)
    let group = groups.get(file)
    if (group === undefined) {
      groups.set(file, [entry])
    } else {
      group.push(entry)
    }
  }
  return [...groups]
    .map(([file, group]) =>
      [
        style.colors.bold(
          cutToWidth(file, { width: style.width, side: 'start', ellipsis }),
        ),
        layout.formatGroup(group),
      ].join('\n'),
    )
    .join('\n\n')
}
