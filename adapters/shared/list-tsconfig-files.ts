import { existsSync } from 'node:fs'
import path from 'node:path'

import { readTsconfigExtends } from './read-tsconfig-extends'

/**
 * Lists the `tsconfig.json` files that may decide how a loader, such as Vite or
 * tsx, transforms the files of a directory: the path of a `tsconfig.json` in
 * the directory and in every directory above it up to the first that has one,
 * so creating a closer one changes the list, and every file the found one
 * extends, through the whole chain.
 *
 * @param directory - Absolute path of the directory.
 * @param cache - Lists found before, by directory; filled here.
 * @returns Absolute paths, missing files included.
 */
export function listTsconfigFiles(
  directory: string,
  cache: Map<string, string[]>,
): string[] {
  let cached = cache.get(directory)
  if (cached !== undefined) {
    return cached
  }
  let file = path.join(directory, 'tsconfig.json')
  let parent = path.dirname(directory)
  let files = [file]
  if (existsSync(file)) {
    for (let index = 0; index < files.length; index++) {
      let extendedFiles = readTsconfigExtends(files[index]!)
      for (let extended of extendedFiles) {
        if (!files.includes(extended)) {
          files.push(extended)
        }
      }
    }
  } else if (parent !== directory) {
    files.push(...listTsconfigFiles(parent, cache))
  }
  cache.set(directory, files)
  return files
}
