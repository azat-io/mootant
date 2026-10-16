import type * as RegexppModule from '@eslint-community/regexpp'

import { createRequire } from 'node:module'

/**
 * The regexpp module: parser, AST visitor and validator of regular expressions.
 */
type Regexpp = typeof RegexppModule

/**
 * The module once it is loaded, or null before the first regular expression.
 */
let loaded: Regexpp | null = null

/**
 * Loads `@eslint-community/regexpp` on first use and keeps it. Runs without a
 * regex mutator, or files without regular expressions, never load it. The
 * module is required synchronously, because mutators visit a file
 * synchronously.
 *
 * @returns The regexpp module.
 */
export function loadRegexpp(): Regexpp {
  loaded ??= createRequire(import.meta.url)(
    '@eslint-community/regexpp',
  ) as Regexpp
  return loaded
}
