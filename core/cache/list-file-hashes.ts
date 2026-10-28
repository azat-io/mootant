import { compareCodeUnits } from '../compare-code-units'
import { getPortablePath } from './get-portable-path'

/**
 * Lists files with their hashes for a cache key, each file once, by portable
 * path (`getPortablePath`) in code unit order.
 *
 * @param files - Absolute paths, duplicates allowed.
 * @param input - Hashes of the files and the project root.
 * @param input.hashes - Hashes of the files by absolute path, null for a
 *   missing one.
 * @param input.root - Project root; paths are listed relative to it.
 * @returns Portable path and hash of each file, or null for a file without a
 *   hash.
 */
export function listFileHashes(
  files: Iterable<string>,
  input: { hashes: ReadonlyMap<string, string | null>; root: string },
): [string, string | null][] {
  let { hashes, root } = input
  return [...new Set(files)]
    .map((file): [string, string | null] => [
      getPortablePath(file, root),
      hashes.get(file) ?? null,
    ])
    .toSorted(([left], [right]) => compareCodeUnits(left, right))
}
