import { describe, expect, it } from 'vitest'

import { isKebabCaseName } from '../../../core/plugins/is-kebab-case-name'

describe('isKebabCaseName', () => {
  it.each(['string-literal', 'a', 'acme', 'es2015-syntax', 'a1-b2-c3', 'x-1'])(
    'accepts %j',
    value => {
      expect(isKebabCaseName(value)).toBe(true)
    },
  )

  it.each([
    '',
    'String-literal',
    'stringLiteral',
    'string_literal',
    '1-literal',
    '-literal',
    'literal-',
    'string--literal',
    'string literal',
    'acme/literal',
    'é-literal',
  ])('rejects %j', value => {
    expect(isKebabCaseName(value)).toBe(false)
  })
})
