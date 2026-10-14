import { describe, expect, it } from 'vitest'

import { isLoopAdvanceValue } from '../../../core/syntax/is-loop-advance-value'
import { createTestFile } from '../../helpers/create-test-file'

describe('isLoopAdvanceValue', () => {
  it.each([
    { source: 'while (!done) { done = true }', type: 'Literal', text: 'true' },
    {
      source: 'while (!done) { done = (true as boolean) }',
      type: 'Literal',
      text: 'true',
    },
    {
      source: 'while (s) { s = s.slice(1) }',
      type: 'CallExpression',
      text: 's.slice(1)',
    },
    {
      source: 'while (x < n) { x = x * 2 }',
      type: 'BinaryExpression',
      text: 'x * 2',
    },
    {
      source:
        'async function f() { while (!done) { ({ done, value } = await reader.read()) } }',
      text: 'await reader.read()',
      type: 'AwaitExpression',
    },
    {
      source: 'while (a < 100) { [a, b] = [b, a + b] }',
      type: 'ArrayExpression',
      text: '[b, a + b]',
    },
  ] as const)('accepts $text in $source', ({ source, type, text }) => {
    let { find, tree } = createTestFile(source)

    expect(isLoopAdvanceValue(tree, find(type, text))).toBe(true)
  })

  it.each([
    {
      source: 'while (!done) { done ||= true }',
      type: 'Literal',
      text: 'true',
    },
    {
      source: 'while (!done) { other = true }',
      type: 'Literal',
      text: 'true',
    },
    {
      source: 'while (done) { done = true }',
      type: 'Identifier',
      text: 'done',
    },
    { source: 'while (!done) { f(true) }', type: 'Literal', text: 'true' },
    { source: 'done = true', type: 'Literal', text: 'true' },
    { source: 'done = true', text: 'done = true', type: 'Program' },
    {
      source: 'while (!done) { [other] = [true] }',
      type: 'ArrayExpression',
      text: '[true]',
    },
  ] as const)('rejects $text in $source', ({ source, type, text }) => {
    let { find, tree } = createTestFile(source)

    expect(isLoopAdvanceValue(tree, find(type, text))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('done = true')
    let other = createTestFile('done = true')

    expect(() => isLoopAdvanceValue(tree, other.find('Literal'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
