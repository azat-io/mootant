import { existsSync } from 'node:fs'
import path from 'node:path'

import { readTsconfigReferences } from './read-tsconfig-references'
import { readTsconfigExtends } from './read-tsconfig-extends'

/**
 * Lists the `tsconfig.json` files that may decide how a loader, such as Vite or
 * tsx, transforms the files of a directory: the path of a `tsconfig.json` in
 * the directory and in every directory above it up to the first that has one,
 * so creating a closer one changes the list; with `references`, every file the
 * found one references, as Vite takes the options of a referenced file that
 * includes the module, and the files those reference in turn, which Vue's
 * compiler reads to resolve types; and every file any of them extends, through
 * the whole chain.
 *
 * @param directory - Absolute path of the directory.
 * @param cache - Lists found before, by directory, with the same options;
 *   filled here.
 * @param options - What to follow.
 * @param options.references - Whether to follow `references`, which tsx never
 *   reads; off when omitted.
 * @returns Absolute paths, each once, missing files included.
 */
export function listTsconfigFiles(
  directory: string,
  cache: Map<string, string[]>,
  options: { references?: boolean } = {},
): string[] {
  let cached = cache.get(directory)
  if (cached !== undefined) {
    return cached
  }
  let file = path.join(directory, 'tsconfig.json')
  let parent = path.dirname(directory)
  let files = [file]
  if (existsSync(file)) {
    if (options.references) {
      follow(files, readTsconfigReferences)
    }
    follow(files, readTsconfigExtends)
  } else if (parent !== directory) {
    files.push(
      ...listTsconfigFiles(parent, cache, options).filter(
        inherited => inherited !== file,
      ),
    )
  }
  cache.set(directory, files)
  return files
}

/**
 * Adds to a list of files, in place, every file one of them links to by a
 * reader, those it adds included, each file once.
 *
 * @param files - Absolute paths; extended here.
 * @param read - Lists the files a file links to.
 */
function follow(files: string[], read: (file: string) => string[]): void {
  for (let index = 0; index < files.length; index++) {
    let linkedFiles = read(files[index]!)
    for (let linked of linkedFiles) {
      if (!files.includes(linked)) {
        files.push(linked)
      }
    }
  }
}
