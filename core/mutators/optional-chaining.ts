import type { ChainExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { TextEdit } from '../../types/source/text-edit'
import type { SkipNote } from '../../types/mutant/skip-note'
import type { Mutator } from '../../types/mutator/mutator'

import { isNonNullable } from './shared/is-non-nullable'
import { isFunction } from '../syntax/is-function'
import { walkTree } from '../tree/walk-tree'

/**
 * Nodes whose evaluation may never finish: calls, `new`, tagged templates and
 * JSX, which call functions, `await` and `yield`, which may never resume,
 * spread elements and array patterns, whose iterator may never end, and class
 * expressions, which run their static blocks, static initializers and
 * decorators.
 */
let hangingTypes = new Set([
  'TaggedTemplateExpression',
  'AwaitExpression',
  'ClassExpression',
  'YieldExpression',
  'CallExpression',
  'NewExpression',
  'SpreadElement',
  'ArrayPattern',
  'JSXFragment',
  'JSXElement',
])

/**
 * Optional link of a chain: the element that carries `?.` and the object or
 * callee before it.
 */
interface OptionalLink {
  /**
   * Arguments of the call or key of the computed member after `?.`, which the
   * mutant computes even when the receiver is nullish; none after a property
   * name.
   */
  guarded: readonly Node[]

  /**
   * Object of a member or callee of a call that `?.` guards.
   */
  receiver: Node

  /**
   * Whether `?.` stands before the arguments of a call.
   */
  call: boolean

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
 * edited (T10). Skipped mutants follow as skipped replacements (see
 * `getSkip`).
 */
export let optionalChaining: Mutator<OptionalChainingOptions> = {
  create(context) {
    let { sourceCode } = context
    return {
      ChainExpression(node) {
        return getOptionalLinks(node).map(link => {
          let { receiver, text } = link
          let start = sourceCode.findTokenStart(receiver.end, node.end)
          let edit: TextEdit = { end: start + 2, start, text }
          let replacement: Replacement = {
            text: sourceCode.editText(node, [edit]),
            node,
          }
          let skip = getSkip(node, link, context)
          if (skip) {
            replacement.skip = skip
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
 * Finds why the removal of one `?.` is skipped. A chain the mutant switch
 * cannot wrap, such as a `delete` operand or a callee that passes `this`, is
 * kept (catalog 2.1). A link after the groups of a regex match that are never
 * nullish there (see `getNamedGroupsFact`) is kept, whatever the options. A
 * link whose object or callee cannot be nullish by type hints is kept unless
 * the `nonNullable` option is set. A removal keeps the value or throws a
 * `TypeError`, so in the value that advances a loop it is kept without the
 * `timeouts` setting only where it may keep the loop running: `eval` called
 * without `?.` is a direct eval, which sees local variables, the arguments of a
 * call or the key of a computed member, which the mutant computes even for a
 * nullish receiver, may never finish (see `mayHang`), and a `try` inside the
 * loop may catch the error (see `isCaughtInLoop`).
 *
 * @param node - Chain of the link.
 * @param link - Link whose `?.` the mutant removes.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the removal is emitted.
 */
function getSkip(
  node: ChainExpression,
  link: OptionalLink,
  context: MutatorContext<OptionalChainingOptions>,
): SkipNote | null {
  let { settings, options, syntax, hints } = context
  if (!syntax.isValuePosition(node)) {
    return {
      reason: 'Mootant cannot switch a mutant on for a chain in this position',
      rule: 'invalid-target',
    }
  }
  let groups = syntax.getNamedGroupsFact(link.receiver)
  if (groups !== null) {
    return { rule: 'named-groups', reason: groups }
  }
  if (!options.nonNullable && isNonNullable(hints.getType(link.receiver))) {
    return {
      reason: 'the type hints say the object cannot be nullish',
      rule: 'non-nullable',
    }
  }
  if (settings.timeouts || !syntax.isLoopAdvanceValue(node)) {
    return null
  }
  let callee = syntax.unwrapExpression(link.receiver)
  if (link.call && callee.type === 'Identifier' && callee.name === 'eval') {
    return {
      reason:
        'without ?. the eval call is direct and sees local variables, so it may keep the loop running forever',
      rule: 'loop-advance',
    }
  }
  if (link.guarded.some(part => mayHang(part))) {
    return {
      reason:
        link.call ?
          'without ?. the arguments are computed even for a nullish callee and may never finish, so it may keep the loop running forever'
        : 'without ?. the key is computed even for a nullish object and may never finish, so it may keep the loop running forever',
      rule: 'loop-advance',
    }
  }
  return syntax.isCaughtInLoop(node) ?
      {
        reason:
          'a try inside the loop may catch its TypeError, so it may keep the loop running forever',
        rule: 'loop-advance',
      }
    : null
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
            guarded: current.computed ? [current.property] : [],
            text: current.computed ? '' : '.',
            receiver: current.object,
            call: false,
          })
        }
        current = current.object
        break
      case 'CallExpression':
        if (current.optional) {
          links.unshift({
            guarded: current.arguments,
            receiver: current.callee,
            call: true,
            text: '',
          })
        }
        current = current.callee
        break
      default:
        return links
    }
  }
}

/**
 * Tells whether computing an argument or a key may never finish: it holds,
 * outside nested functions, a node of `hangingTypes`, also in code that Mootant
 * does not mutate but runs, such as the path of `import()`. Getters, setters,
 * conversions and the other hooks that operators call are not known, so they do
 * not count.
 *
 * @param node - Argument of a call or key of a computed member.
 * @returns Whether the computation may hang.
 */
function mayHang(node: Node): boolean {
  let found = false
  walkTree(node, child => {
    if (found || isFunction(child)) {
      return false
    }
    found = hangingTypes.has(child.type)
    return !found
  })
  return found
}
