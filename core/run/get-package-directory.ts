import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Finds the directory of mootant's own package: the closest directory above
 * this module with a `package.json`, both in the sources and in the build.
 *
 * @param start - Directory to start from; this module's directory when omitted.
 * @returns Absolute path of the package directory, or the start directory when
 *   no `package.json` is found.
 */
export function getPackageDirectory(
  start: string = import.meta.dirname,
): string {
  let directory = start
  while (!existsSync(path.join(directory, 'package.json'))) {
    let parent = path.dirname(directory)
    if (parent === directory) {
      return start
    }
    directory = parent
  }
  return directory
}
