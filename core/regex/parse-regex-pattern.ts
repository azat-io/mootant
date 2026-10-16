import type { RegExpParser, AST } from '@eslint-community/regexpp'

import { loadRegexpp } from './load-regexpp'

/**
 * Parser shared by every pattern, created on first use.
 */
let parser: RegExpParser | null = null

/**
 * Parses the pattern of a regular expression into the regexpp tree, in the mode
 * its flags select: Annex B without `u` and `v`, Unicode mode with `u`, Unicode
 * sets mode with `v`. Node offsets are relative to the pattern.
 *
 * @param pattern - Text between the slashes of a literal.
 * @param flags - Flags of the literal.
 * @returns The pattern tree, or null when regexpp cannot parse the pattern,
 *   such as syntax newer than it knows.
 */
export function parseRegexPattern(
  pattern: string,
  flags: string,
): AST.Pattern | null {
  if (parser === null) {
    let { RegExpParser: Parser } = loadRegexpp()
    parser = new Parser()
  }
  try {
    return parser.parsePattern(pattern, 0, pattern.length, {
      unicodeSets: flags.includes('v'),
      unicode: flags.includes('u'),
    })
  } catch {
    return null
  }
}
