import { describe, expect, it } from 'vitest'

import { VALUE_PREFIXES } from '../../../../adapters/vitest/worker/value-prefixes'

describe('VALUE_PREFIXES', () => {
  it('names values with prefixes that hold =, which no environment variable name has', () => {
    expect(VALUE_PREFIXES).toStrictEqual({
      defines: 'defines=',
      provide: 'provide=',
      define: 'define=',
    })
  })
})
