import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Lists the `package.json` files Node may read to decide the module format and
 * the `#` imports of the files of a directory: the path of a `package.json` in
 * the directory and in every directory above it up to the first that has one,
 * so creating a closer one changes the list.
 *
 * @param directory - Absolute path of the directory.
 * @param cache - Lists found before, by directory; filled here.
 * @returns Absolute paths, missing files included.
 */
export function listPackageFiles(
  directory: string,
  cache: Map<string, string[]>,
): string[] {
  let cached = cache.get(directory)
  if (cached !== undefined) {
    return cached
  }
  let file = path.join(directory, 'package.json')
  let parent = path.dirname(directory)
  let files =
    parent === directory || existsSync(file) ?
      [file]
    : [file, ...listPackageFiles(parent, cache)]
  cache.set(directory, files)
  return files
}
