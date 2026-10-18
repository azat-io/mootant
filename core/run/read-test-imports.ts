import { readFile } from 'node:fs/promises'
import { parseSync } from 'oxc-parser'
import path from 'node:path'

import { getParserOptions } from '../parser/get-parser-options'

/**
 * A relative module specifier: `.`, `..`, or one that starts with `./` or
 * `../`.
 */
const RELATIVE_PATTERN = /^\.\.?(?:\/|$)/u

/**
 * A string literal without substitutions as the specifier of a dynamic import.
 */
const LITERAL_PATTERN = /^(?<quote>["'`])(?<value>[^"$'\\`]*)\k<quote>$/u

/**
 * Reads what each test file imports through relative specifiers: static imports
 * other than type-only ones, re-exports and dynamic imports of a plain string.
 * Specifiers are resolved against the directory of the test file as written,
 * without a query and without trying extensions. A test file that cannot be
 * read or parsed imports nothing; the order of its test files then falls back
 * to cost.
 *
 * @param files - Absolute paths of the test files.
 * @returns Absolute import targets by test file path.
 */
export async function readTestImports(
  files: Iterable<string>,
): Promise<Map<string, string[]>> {
  let entries = await Promise.all(
    [...new Set(files)].map(async file => {
      let options = getParserOptions(file)
      let text: string
      try {
        text = options === null ? '' : await readFile(file, 'utf8')
      } catch {
        text = ''
      }
      let { module } = parseSync(file, text, options ?? {})
      let specifiers = [
        ...module.staticImports
          .filter(
            entry =>
              entry.entries.length === 0 ||
              entry.entries.some(specifier => !specifier.isType),
          )
          .map(entry => entry.moduleRequest.value),
        ...module.staticExports.flatMap(entry =>
          entry.entries.flatMap(specifier =>
            specifier.moduleRequest === null || specifier.isType ?
              []
            : [specifier.moduleRequest.value],
          ),
        ),
        ...module.dynamicImports.flatMap(entry => {
          let literal = LITERAL_PATTERN.exec(
            text.slice(entry.moduleRequest.start, entry.moduleRequest.end),
          )
          return literal === null ? [] : [literal.groups!['value']!]
        }),
      ]
      let directory = path.dirname(file)
      let targets = specifiers
        .map(specifier => specifier.split('?', 1)[0]!)
        .filter(specifier => RELATIVE_PATTERN.test(specifier))
        .map(specifier => path.resolve(directory, specifier))
      return [file, [...new Set(targets)]] as const
    }),
  )
  return new Map(entries.map(([file, targets]) => [file, [...targets]]))
}
