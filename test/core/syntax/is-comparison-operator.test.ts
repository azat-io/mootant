import { describe, expect, it } from 'vitest'

import { isComparisonOperator } from '../../../core/syntax/is-comparison-operator'

describe('isComparisonOperator', () => {
  it.each(['<', '<=', '>', '>=', '==', '!=', '===', '!==', 'in', 'instanceof'])(
    'accepts %s',
    operator => {
      expect(isComparisonOperator(operator)).toBe(true)
    },
  )

  it.each(['+', '-', '&', '<<', '>>>', '&&', '??', '=', '+=', '!'])(
    'rejects %s',
    operator => {
      expect(isComparisonOperator(operator)).toBe(false)
    },
  )
})
