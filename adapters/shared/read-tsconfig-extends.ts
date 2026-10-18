import type { ExpressionStatement } from 'oxc-parser'

import { readFileSync, realpathSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { parseSync } from 'oxc-parser'
import path from 'node:path'

/**
 * Byte order mark some editors put at the start of a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

/**
 * Lists the configuration files a `tsconfig.json` file extends, directly: those
 * given by a path, and those of packages that resolve outside `node_modules`,
 * as in a workspace. Packages in `node_modules` are left out, since the
 * lockfile stands for them; so are files that cannot be read or parsed. The
 * file is JSON with comments and trailing commas, as TypeScript reads it, so it
 * is parsed as a JavaScript expression.
 *
 * @param file - Absolute path of the `tsconfig.json` file.
 * @returns Absolute paths of the extended files that exist.
 */
export function readTsconfigExtends(file: string): string[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  let specifiers = readExtends(text)
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
    if (found !== undefined && !found.includes('/node_modules/')) {
      files.push(found)
    }
  }
  return files
}

/**
 * Reads the `extends` value of the text of a `tsconfig.json` file: the last
 * `extends` property of the top-level object, when it is a string or an array,
 * whose strings it keeps.
 *
 * @param text - Text of the file, with comments and trailing commas allowed.
 * @returns Specifiers, or none when the text is not an object.
 */
function readExtends(text: string): string[] {
  let { program, errors } = parseSync(
    'tsconfig.js',
    `(\n${text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text}\n)`,
    { preserveParens: false, lang: 'js' },
  )
  let [statement] = program.body as [ExpressionStatement | undefined]
  if (
    errors.length > 0 ||
    program.body.length !== 1 ||
    statement?.expression.type !== 'ObjectExpression'
  ) {
    return []
  }
  let value = statement.expression.properties.findLast(
    property =>
      property.type === 'Property' &&
      !property.computed &&
      ((property.key.type === 'Literal' && property.key.value === 'extends') ||
        (property.key.type === 'Identifier' &&
          property.key.name === 'extends')),
  )
  if (value?.type !== 'Property') {
    return []
  }
  let elements =
    value.value.type === 'ArrayExpression' ?
      value.value.elements
    : [value.value]
  return elements.flatMap(element =>
    element?.type === 'Literal' && typeof element.value === 'string' ?
      [element.value]
    : [],
  )
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
