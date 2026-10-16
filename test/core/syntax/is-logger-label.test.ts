import { describe, expect, it } from 'vitest'

import { isLoggerLabel } from '../../../core/syntax/is-logger-label'
import { createTestFile } from '../../helpers/create-test-file'

describe('isLoggerLabel', () => {
  it.each([
    "'Build'",
    '`Build`',
    `\`\${name}:\${this.id}\``,
    'name',
    'this.name',
    'options?.name',
    '42',
    "'Build' as const",
    '{ module }',
    `{ module: 'auth', id: user.id, tag: \`\${name}\` }`,
    '{}',
  ])('accepts %s', source => {
    let argument = createTestFile(`f(${source})`).find('CallExpression')
      .arguments[0]!
    expect(isLoggerLabel(argument)).toBe(true)
  })

  it.each([
    'getName()',
    `\`\${getName()}\``,
    '/build/u',
    'a + b',
    '{ count: items.filter(i => i > 0).length }',
    '{ serializers: { user: u => u.id } }',
    "{ redact: ['password'] }",
    '{ ...bindings }',
    '{ [key]: 1 }',
    '{ name() {} }',
    '{ get name() { return 1 } }',
    '...labels',
  ])('rejects %s', source => {
    let argument = createTestFile(`f(${source})`).find('CallExpression')
      .arguments[0]!
    expect(isLoggerLabel(argument)).toBe(false)
  })
})
