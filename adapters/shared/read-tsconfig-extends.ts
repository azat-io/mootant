import { realpathSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { findTsconfigProperty } from './find-tsconfig-property'
import { parseTsconfig } from './parse-tsconfig'

/**
 * Lists the configuration files a `tsconfig.json` file extends, directly: those
 * given by a path, and those of packages, in a workspace or in `node_modules`.
 * Files that cannot be read or parsed (`parseTsconfig`) are left out.
 *
 * @param file - Absolute path of the `tsconfig.json` file.
 * @returns Absolute paths of the extended files that exist.
 */
export function readTsconfigExtends(file: string): string[] {
  let value = findTsconfigProperty(parseTsconfig(file), 'extends')
  let elements = value?.type === 'ArrayExpression' ? value.elements : [value]
  let specifiers = elements.flatMap(element =>
    element?.type === 'Literal' && typeof element.value === 'string' ?
      [element.value]
    : [],
  )
  let directory = path.dirname(file)
  let files: string[] = []
  for (let specifier of specifiers) {
    let resolved =
      /^\.{1,2}(?:[/\\]|$)/u.test(specifier) || path.isAbsolute(specifier) ?
        [path.resolve(directory, specifier)]
      : resolvePackage(file, specifier)
    let found = resolved
      .flatMap(candidate => [candidate, `${candidate}.json`])
      .find(candidate => candidate.endsWith('.json') && existsSync(candidate))
    if (found !== undefined) {
      files.push(found)
    }
  }
  return files
}

/**
 * Resolves a package `extends` specifier as Node would, the specifier itself
 * and its `tsconfig.json`, following symbolic links.
 *
 * @param file - Absolute path of the extending file.
 * @param specifier - Package specifier, such as `@company/tsconfig/base`.
 * @returns Real paths of the candidates that resolve.
 */
function resolvePackage(file: string, specifier: string): string[] {
  let require = createRequire(file)
  return [specifier, `${specifier}/tsconfig.json`].flatMap(candidate => {
    try {
      return [realpathSync(require.resolve(candidate))]
    } catch {
      return []
    }
  })
}
