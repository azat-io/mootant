import type { SwitchedFile } from '../../types/adapter/switched-file'

/**
 * Byte order mark as it appears at the start of a text read as UTF-8.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

/**
 * Picks the text an adapter serves for a module of a switched file. The
 * switched text applies only to the text mootant listed mutants from; a loader
 * that dropped the leading byte order mark gets the switched text without it,
 * since the mark is never inside a mutant range.
 *
 * @param entry - Switched file of the module.
 * @param code - Text the test runner loaded for the module.
 * @returns The switched text to serve, or null when the loaded text differs and
 *   must be served as is.
 */
export function resolveSwitchedText(
  entry: SwitchedFile,
  code: string,
): string | null {
  if (code === entry.original) {
    return entry.switched
  }
  if (
    entry.original.startsWith(BYTE_ORDER_MARK) &&
    code === entry.original.slice(BYTE_ORDER_MARK.length)
  ) {
    return entry.switched.slice(BYTE_ORDER_MARK.length)
  }
  return null
}
