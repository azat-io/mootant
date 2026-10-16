import type { AST } from '@eslint-community/regexpp'

import type { TextEdit } from '../../types/source/text-edit'

import { parseRegexPattern } from './parse-regex-pattern'
import { loadRegexpp } from './load-regexpp'

/**
 * Kinds of assertions that are single tokens, without a pattern inside.
 */
const TOKEN_ASSERTION_KINDS = new Set(['start', 'word', 'end'])

/**
 * Tells whether an edit of a pattern leaves every token around it as it was, so
 * the mutant is the change it reports. Plain string splicing may merge the
 * neighbors of the edit into a different token: without `u`, removing `?` from
 * `(a)\1?0` turns the backreference and `0` into the octal escape `\10`;
 * removing `\w` from `[a\w-z]` makes the range `a-z`; removing `a` from `[a^b]`
 * negates the class. Every character, character set, backreference and edge or
 * word assertion outside the edited range must keep its type and text at its
 * shifted offset in the new pattern.
 *
 * @param original - Tree of the original pattern.
 * @param flags - Flags of the literal.
 * @param edit - Edit with offsets relative to the original pattern.
 * @returns Whether the new pattern keeps the tokens around the edit.
 */
export function keepsNeighborTokens(
  original: AST.Pattern,
  flags: string,
  edit: TextEdit,
): boolean {
  let { raw } = original
  let changed = parseRegexPattern(
    `${raw.slice(0, edit.start)}${edit.text}${raw.slice(edit.end)}`,
    flags,
  )
  if (changed === null) {
    return false
  }
  let shift = edit.text.length - (edit.end - edit.start)
  let tokens = new Set(collectTokens(changed))
  return collectTokens(original, token => {
    if (token.end <= edit.start) {
      return token.start
    }
    return token.start >= edit.end ? token.start + shift : null
  }).every(key => tokens.has(key))
}

/**
 * Lists the tokens of a pattern as `type:start:raw` keys.
 *
 * @param tree - Pattern tree.
 * @param locate - Gives the offset a token is keyed at, or null to leave it
 *   out; by default its own start.
 * @returns Keys of the tokens.
 */
function collectTokens(
  tree: AST.Pattern,
  locate: (token: AST.Node) => number | null = token => token.start,
): string[] {
  let keys: string[] = []

  /**
   * Adds the key of a token.
   *
   * @param token - Leaf of the tree.
   */
  function add(token: AST.Node): void {
    let start = locate(token)
    if (start !== null) {
      keys.push(`${token.type}:${start}:${token.raw}`)
    }
  }

  loadRegexpp().visitRegExpAST(tree, {
    onAssertionEnter(node) {
      if (TOKEN_ASSERTION_KINDS.has(node.kind)) {
        add(node)
      }
    },
    onBackreferenceEnter: add,
    onCharacterSetEnter: add,
    onCharacterEnter: add,
  })
  return keys
}
