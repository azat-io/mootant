import { describe, expect, it } from 'vitest'

import { printRegexLiteral } from '../../../core/regex/print-regex-literal'

describe('printRegexLiteral', () => {
  it('prints a pattern and its flags', () => {
    expect(printRegexLiteral('a+', 'gi')).toBe('/a+/gi')
  })

  it('prints an empty pattern as an empty group', () => {
    expect(printRegexLiteral('', 'g')).toBe('/(?:)/g')
  })
})
