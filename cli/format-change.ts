import { shortenFragment } from './shorten-fragment'

/**
 * Formats the change of a mutant or skipped candidate as `original ->
 * replacement`.
 *
 * @param entry - Original and replacement texts.
 * @returns The change on one line.
 */
export function formatChange(entry: {
  replacement: string
  original: string
}): string {
  return `${shortenFragment(entry.original)} -> ${shortenFragment(entry.replacement)}`
}
