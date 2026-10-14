import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { InferredType } from '../../../types/inferred-type'
import type { ValueKind } from '../../../types/value-kind'
import type { TypeHints } from '../../../types/type-hints'

import { createTypeHints } from '../../../core/hints/create-type-hints'

/**
 * Node handed to the hints; the fake provider does not look at it.
 */
let node = { type: 'Identifier', name: 'x', start: 0, end: 1 } as Node

/**
 * Builds type hints over a provider that gives every node the same type.
 *
 * @param kinds - Kinds that the fake provider gives every node, or null for an
 *   unknown type.
 * @returns The hints over the fake provider.
 */
function createHints(kinds: readonly ValueKind[] | null): TypeHints {
  let type: InferredType = { kinds }
  return createTypeHints({
    getAnnotationType: () => type,
    getType: () => type,
  })
}

/**
 * Kinds of any non-nullish value.
 */
const NON_NULLISH: ValueKind[] = [
  'array',
  'bigint',
  'boolean',
  'function',
  'number',
  'object',
  'promise',
  'string',
  'symbol',
]

describe('createTypeHints', () => {
  it.each<{
    kinds: readonly ValueKind[] | null
    cannot: boolean
    kind: ValueKind
    can: boolean
  }>([
    { kinds: ['number'], kind: 'number', cannot: false, can: true },
    { kinds: ['number'], kind: 'string', cannot: true, can: false },
    { kind: 'number', cannot: false, kinds: null, can: false },
    { cannot: false, kind: 'null', kinds: null, can: false },
    { kinds: ['null', 'string'], cannot: false, kind: 'null', can: true },
    { kinds: ['null', 'string'], kind: 'undefined', cannot: true, can: false },
    { kinds: NON_NULLISH, cannot: true, kind: 'null', can: false },
    { kinds: NON_NULLISH, kind: 'string', cannot: false, can: true },
  ])(
    'answers canBe and cannotBe for $kinds and $kind',
    ({ cannot, kinds, kind, can }) => {
      let hints = createHints(kinds)
      expect(hints.canBe(node, kind)).toBe(can)
      expect(hints.cannotBe(node, kind)).toBe(cannot)
    },
  )

  it.each<[readonly ValueKind[] | null, ValueKind[], boolean]>([
    [['number'], ['bigint', 'number'], true],
    [['number'], ['string'], false],
    [null, ['number'], false],
    [['null', 'string'], ['string'], false],
    [['null', 'string'], ['null', 'string', 'undefined'], true],
    [NON_NULLISH, ['string'], false],
    [NON_NULLISH, NON_NULLISH, true],
  ])('answers isOnly for %j and %j', (kinds, allowed, expected) => {
    expect(createHints(kinds).isOnly(node, allowed)).toBe(expected)
  })

  it('delegates getType and getAnnotationType to the provider', () => {
    let type: InferredType = { kinds: ['string'] }
    let annotationType: InferredType = { kinds: ['number'] }
    let hints = createTypeHints({
      getAnnotationType: () => annotationType,
      getType: () => type,
    })
    expect(hints.getType(node)).toBe(type)
    expect(hints.getAnnotationType(node)).toBe(annotationType)
  })
})
