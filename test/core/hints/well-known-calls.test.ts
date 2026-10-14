import { describe, expect, it } from 'vitest'

import { WELL_KNOWN_CALLS } from '../../../core/hints/well-known-calls'
import { compareCodeUnits } from '../../../core/compare-code-units'

/**
 * Every kind a value can have.
 */
let valueKinds = new Set([
  'undefined',
  'function',
  'boolean',
  'promise',
  'string',
  'number',
  'bigint',
  'object',
  'symbol',
  'array',
  'null',
])

describe('wELL_KNOWN_CALLS', () => {
  it.each([...WELL_KNOWN_CALLS])(
    'maps %s to valid sorted kinds',
    (_key, kinds) => {
      expect(kinds.length).toBeGreaterThan(0)
      expect(kinds.every(kind => valueKinds.has(kind))).toBe(true)
      expect(kinds).toStrictEqual(
        kinds
          .filter((kind, index) => kinds.indexOf(kind) === index)
          .toSorted(compareCodeUnits),
      )
    },
  )

  it.each(Array.from(WELL_KNOWN_CALLS.keys(), key => [key]))(
    'has a valid key %s',
    key => {
      expect(key).toMatch(/^(?:\.[A-Za-z]+|[A-Za-z]+(?:\.(?:[A-Za-z]+|\*))?)$/u)
    },
  )
})
