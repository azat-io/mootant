import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { ValueKind } from '../../types/hints/value-kind'

/**
 * Kinds of a receiver besides a string that keep a `match` call the method of a
 * string, or a call that an optional chain ends or that throws either way.
 */
const STRING_KINDS: readonly ValueKind[] = ['string', 'undefined', 'null']

/**
 * Finds the call of the `match` method of a string that a regular expression is
 * the only argument of: the type hints tell that the receiver holds a string,
 * and perhaps null or undefined. A method of that name on anything else may
 * read what the regular expression matched and go on from there, as the `match`
 * of a scanner does with `stream.match(/^\d+/)`, which moves the stream past
 * the match even when the code only tests the result.
 *
 * @param node - Regular expression literal or `RegExp` call.
 * @param context - Syntax helpers and type hints of the file.
 * @returns The call, or null in any other position.
 */
export function findStringMatchCall(
  node: Node,
  context: Pick<MutatorContext, 'syntax' | 'hints'>,
): Node | null {
  let { syntax, hints } = context
  let { parent } = syntax.getContextSlot(node)
  if (parent?.type !== 'CallExpression' || parent.arguments.length !== 1) {
    return null
  }
  let callee = syntax.unwrapExpression(parent.callee)
  return (
      callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.name === 'match' &&
        hints.canBe(callee.object, 'string') &&
        hints.isOnly(callee.object, STRING_KINDS)
    ) ?
      parent
    : null
}
