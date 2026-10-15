import { describe, expect, it } from 'vitest'

import { isModuleCall } from '../../../core/syntax/is-module-call'
import { createTestFile } from '../../helpers/create-test-file'

describe('isModuleCall', () => {
  it.each([
    ["require('./a')", 0],
    ["require.resolve('./a')", 0],
    ["module.require('./a')", 0],
    ["import.meta.resolve('./a')", 0],
    ["(require)('./a')", 0],
    ["import.meta.glob('./a/*.ts')", 0],
    ["import.meta.glob('./a/*.ts', { eager: true })", 1],
  ])('accepts %s at %i', (source, index) => {
    expect(
      isModuleCall(
        createTestFile(source, 'example.js').find('CallExpression'),
        index,
      ),
    ).toBe(true)
  })

  it.each([
    ["requires('./a')", 0],
    ["load('./a')", 0],
    ["module.exports('./a')", 0],
    ["loader.require('./a')", 0],
    ["require.cache('./a')", 0],
    ["import.meta.url('./a')", 0],
    ["f()('./a')", 0],
    ["require('./a', b)", 1],
    ["import.meta.resolve('./a', parent)", 1],
  ])('rejects %s at %i', (source, index) => {
    expect(
      isModuleCall(
        createTestFile(source, 'example.js').find('CallExpression'),
        index,
      ),
    ).toBe(false)
  })
})
