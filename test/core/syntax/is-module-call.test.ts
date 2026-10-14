import { describe, expect, it } from 'vitest'

import { isModuleCall } from '../../../core/syntax/is-module-call'
import { createTestFile } from '../../helpers/create-test-file'

describe('isModuleCall', () => {
  it.each([
    "require('./a')",
    "require.resolve('./a')",
    "module.require('./a')",
    "import.meta.resolve('./a')",
    "(require)('./a')",
  ])('accepts %s', source => {
    expect(
      isModuleCall(createTestFile(source, 'example.js').find('CallExpression')),
    ).toBe(true)
  })

  it.each([
    "requires('./a')",
    "load('./a')",
    "module.exports('./a')",
    "loader.require('./a')",
    "require.cache('./a')",
    "import.meta.url('./a')",
    "f()('./a')",
  ])('rejects %s', source => {
    expect(
      isModuleCall(createTestFile(source, 'example.js').find('CallExpression')),
    ).toBe(false)
  })
})
