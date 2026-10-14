import type { ChainExpression, Node } from 'oxc-parser'

import type { Replacement } from '../../types/replacement'
import type { TextEdit } from '../../types/text-edit'
import type { Mutator } from '../../types/mutator'

import { isNonNullable } from './shared/is-non-nullable'

/**
 * Optional link of a chain: the element that carries `?.` and the object or
 * callee before it.
 */
interface OptionalLink {
  /**
   * Object of a member or callee of a call that `?.` guards.
   */
  receiver: Node

  /**
   * Text that replaces `?.`: `.` before a property name, nothing before `[` or
   * `(`.
   */
  text: string
}

/**
 * Options of the optional-chaining mutator.
 */
interface OptionalChainingOptions {
  /**
   * Whether `?.` is replaced also where type hints say the object cannot be
   * nullish, since annotations can be wrong at runtime.
   */
  nonNullable: boolean
}

/**
 * Replaces `?.` with `.` (catalog 4.13): one mutant per optional link of a
 * chain, in source order, each replacing the whole chain with that one link
 * edited (T10). A link whose object or callee cannot be nullish by type hints
 * is kept unless the `nonNullable` option is set. A chain the mutant switch
 * cannot wrap, such as a `delete` operand or a callee that passes `this`, is
 * kept (catalog 2.1). Skipped mutants follow as skipped replacements.
 */
export let optionalChaining: Mutator<OptionalChainingOptions> = {
  create(context) {
    let { sourceCode, options, syntax, hints } = context
    return {
      ChainExpression(node) {
        let wrapped = syntax.isValuePosition(node)
        return getOptionalLinks(node).map(({ receiver, text }) => {
          let start = sourceCode.findTokenStart(receiver.end, node.end)
          let edit: TextEdit = { end: start + 2, start, text }
          let replacement: Replacement = {
            text: sourceCode.editText(node, [edit]),
            node,
          }
          if (!wrapped) {
            replacement.skip = {
              reason: 'the mutant switch cannot wrap a chain in this position',
              rule: 'invalid-target',
            }
          } else if (
            !options.nonNullable &&
            isNonNullable(hints.getType(receiver))
          ) {
            replacement.skip = {
              reason: 'the type hints say the object cannot be nullish',
              rule: 'non-nullable',
            }
          }
          return replacement
        })
      },
    }
  },
  meta: {
    description: 'Replaces ?. with ., as if the value could never be nullish.',
    defaultOptions: { nonNullable: false },
    countsForSolitary: false,
  },
}

/**
 * Collects the optional links of a chain in source order, walking from the
 * chain's expression through the object of each member, the callee of each call
 * and the operand of each non-null assertion. Arguments and computed keys hold
 * chains of their own.
 *
 * @param chain - Root of an optional chain.
 * @returns Links whose element carries `?.`, leftmost first.
 */
function getOptionalLinks(chain: ChainExpression): OptionalLink[] {
  let links: OptionalLink[] = []
  let current: Node = chain.expression
  for (;;) {
    switch (current.type) {
      case 'TSNonNullExpression':
        current = current.expression
        break
      case 'MemberExpression':
        if (current.optional) {
          links.unshift({
            text: current.computed ? '' : '.',
            receiver: current.object,
          })
        }
        current = current.object
        break
      case 'CallExpression':
        if (current.optional) {
          links.unshift({ receiver: current.callee, text: '' })
        }
        current = current.callee
        break
      default:
        return links
    }
  }
}
