import type {
  ObjectPropertyKind,
  ObjectExpression,
  ObjectProperty,
} from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { SkipNote } from '../../../types/mutant/skip-note'

import { getLiteralValue } from './get-literal-value'

/**
 * Options of the `Intl` constructors with the value each takes when it is
 * absent, by constructor (ECMA-402). Only defaults that neither the locale nor
 * another option changes are listed, so `useGrouping` of `NumberFormat`, the
 * digit counts that depend on the style, and the options of `Collator` that a
 * locale extension may set are left out.
 */
const DEFAULT_OPTIONS: Record<string, Record<string, number | string>> = {
  NumberFormat: {
    trailingZeroDisplay: 'auto',
    roundingMode: 'halfExpand',
    currencyDisplay: 'symbol',
    localeMatcher: 'best fit',
    currencySign: 'standard',
    roundingPriority: 'auto',
    minimumIntegerDigits: 1,
    compactDisplay: 'short',
    notation: 'standard',
    roundingIncrement: 1,
    unitDisplay: 'short',
    signDisplay: 'auto',
    style: 'decimal',
  },
  PluralRules: {
    trailingZeroDisplay: 'auto',
    roundingMode: 'halfExpand',
    localeMatcher: 'best fit',
    roundingPriority: 'auto',
    minimumIntegerDigits: 1,
    roundingIncrement: 1,
    type: 'cardinal',
  },
  DisplayNames: {
    languageDisplay: 'dialect',
    localeMatcher: 'best fit',
    fallback: 'code',
    style: 'long',
  },
  RelativeTimeFormat: {
    localeMatcher: 'best fit',
    numeric: 'always',
    style: 'long',
  },
  ListFormat: {
    localeMatcher: 'best fit',
    type: 'conjunction',
    style: 'long',
  },
  DateTimeFormat: {
    formatMatcher: 'best fit',
    localeMatcher: 'best fit',
  },
  Segmenter: {
    localeMatcher: 'best fit',
    granularity: 'grapheme',
  },
  DurationFormat: {
    localeMatcher: 'best fit',
    style: 'short',
  },
  Collator: {
    localeMatcher: 'best fit',
    usage: 'sort',
  },
}

/**
 * Decides whether the removal of a member of an object literal is skipped
 * because the member sets an option of an `Intl` constructor to its default,
 * such as `type: 'cardinal'` in `new Intl.PluralRules('en', { type: 'cardinal'
 * })`: the constructor reads the same value when the option is absent, so the
 * removal cannot change behavior. The object is the options argument, the
 * second one, of a call or a `new` of a constructor of the global `Intl`, with
 * no spread before it. The member is a property whose value is a literal, not a
 * getter, a method or a shorthand, and whose key no other member may set: the
 * object has no spread, no computed key other than a string literal, no other
 * member with the key and no `__proto__` key, which sets the prototype the
 * option would be read from. Nor may the object have a getter: the constructor
 * runs it while it reads the options, with the object as `this`, so it may see
 * that the option is gone, as `this.style` in a getter of
 * `minimumIntegerDigits` does.
 *
 * @param property - Member that the removal drops.
 * @param node - Object literal of the member.
 * @param context - Mutator context.
 * @returns Rule and reason of the skip, or null when the removal is emitted.
 */
export function getDefaultOptionSkip(
  property: ObjectPropertyKind,
  node: ObjectExpression,
  context: MutatorContext,
): SkipNote | null {
  if (property.type === 'SpreadElement') {
    return null
  }
  let owner = getOptionsOwner(node, context)
  let key = getStaticKey(property)
  if (owner === null || key === null || !Object.hasOwn(owner.options, key)) {
    return null
  }
  let fallback = owner.options[key]!
  let value = getLiteralValue(context.syntax.unwrapExpression(property.value))
  if (
    value !== fallback ||
    node.properties.some(
      member =>
        member !== property &&
        (member.type === 'SpreadElement' ||
          member.kind === 'get' ||
          ['__proto__', null, key].includes(getStaticKey(member))),
    )
  ) {
    return null
  }
  let shown = typeof fallback === 'string' ? `'${fallback}'` : String(fallback)
  return {
    reason: `Intl.${owner.name} uses ${shown} for ${key} when the option is absent`,
    rule: 'default-option',
  }
}

/**
 * Finds the `Intl` constructor whose options an object literal is: the second
 * argument of a call or a `new` of `Intl.Name`, with no spread before it, where
 * `Intl` is the global and `Name` a constructor with known defaults.
 *
 * @param node - Object literal.
 * @param context - Mutator context.
 * @returns Name of the constructor with its defaults, or null when the object
 *   is not the options of one.
 */
function getOptionsOwner(
  node: ObjectExpression,
  context: MutatorContext,
): { options: Record<string, number | string>; name: string } | null {
  let { parent, index, key } = context.syntax.getContextSlot(node)
  if (
    key !== 'arguments' ||
    index !== 1 ||
    (parent?.type !== 'NewExpression' && parent?.type !== 'CallExpression') ||
    parent.arguments[0]!.type === 'SpreadElement'
  ) {
    return null
  }
  let path = context.syntax.getMemberPath(parent.callee)
  if (
    path?.length !== 2 ||
    path[0] !== 'Intl' ||
    !Object.hasOwn(DEFAULT_OPTIONS, path[1]!) ||
    !context.syntax.isGlobalName('Intl')
  ) {
    return null
  }
  return { options: DEFAULT_OPTIONS[path[1]!]!, name: path[1]! }
}

/**
 * Reads the key of a property of an object literal: the name of a plain key, or
 * the value of a string literal key, computed or not.
 *
 * @param property - Property of the object.
 * @returns The key, or null for a key that is not known.
 */
function getStaticKey(property: ObjectProperty): string | null {
  let { key } = property
  if (!property.computed && key.type === 'Identifier') {
    return key.name
  }
  return key.type === 'Literal' && typeof key.value === 'string' ?
      key.value
    : null
}
