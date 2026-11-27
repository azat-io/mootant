import path from 'node:path'

import { findTsconfigProperty } from './find-tsconfig-property'
import { parseTsconfig } from './parse-tsconfig'

/**
 * Lists the configuration files a `tsconfig.json` file references, directly, as
 * TypeScript resolves them: the path of a reference, from the directory of the
 * file, names the file itself when it ends with `.json`, and otherwise a
 * directory whose `tsconfig.json` it means. Files that do not exist are listed
 * too, as creating one changes what a loader does. A file that cannot be read
 * or parsed references nothing.
 *
 * @param file - Absolute path of the `tsconfig.json` file.
 * @returns Absolute paths, missing files included.
 */
export function readTsconfigReferences(file: string): string[] {
  let value = findTsconfigProperty(parseTsconfig(file), 'references')
  let references = value?.type === 'ArrayExpression' ? value.elements : []
  let directory = path.dirname(file)
  return references.flatMap(reference => {
    let target = findTsconfigProperty(reference, 'path')
    if (target?.type !== 'Literal' || typeof target.value !== 'string') {
      return []
    }
    let resolved = path.resolve(directory, target.value)
    return [
      resolved.endsWith('.json') ? resolved : (
        path.join(resolved, 'tsconfig.json')
      ),
    ]
  })
}
