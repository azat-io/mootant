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
    {
      source:
        'while (position < size) { let end = position + space.length; position = end }',
      text: 'position + space.length',
      type: 'BinaryExpression',
    },
    {
      source:
        'while (i < n) { const next = (i + 1) as number; let last: typeof next = 0; i = next }',
      type: 'BinaryExpression',
      text: 'i + 1',
    },
  ] as const)('accepts $text in $source', ({ source, type, text }) => {
    let { scopes, find, tree } = createTestFile(source)

    expect(
      isLoopAdvanceValue({ shared: new Set(), scopes, tree }, find(type, text)),
    ).toBe(true)
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
    {
      source: 'while (i < n) { let next = i + 1; next += 1; i = next }',
      type: 'BinaryExpression',
      text: 'i + 1',
    },
    {
      source: 'while (i < n) { let next = i + 1; i = next * 2 }',
      type: 'BinaryExpression',
      text: 'i + 1',
    },
    {
      source: 'while (i < n) { let next = i + 1; other = next }',
      type: 'BinaryExpression',
      text: 'i + 1',
    },
    {
      source: 'while (i < n) { let { next } = step(i); i = next }',
      type: 'CallExpression',
      text: 'step(i)',
    },
    {
      source: "while (i < n) { let next = i + 1; eval(''); i = next }",
      type: 'BinaryExpression',
      text: 'i + 1',
    },
    {
      source: 'let next = i + 1',
      type: 'BinaryExpression',
      text: 'i + 1',
    },
    {
      source:
        'function f(x: number) { var next = x + 1; let result = next; var next = 10; let i = 0; while (i < 10) i = next; return result }',
      type: 'BinaryExpression',
      text: 'x + 1',
    },
  ] as const)('rejects $text in $source', ({ source, type, text }) => {
    let { scopes, find, tree } = createTestFile(source)

    expect(
      isLoopAdvanceValue({ shared: new Set(), scopes, tree }, find(type, text)),
    ).toBe(false)
  })

  it('follows no variable of a shared scope, which a template may assign', () => {
    let { parsed, scopes, find, tree } = createTestFile(
      'let next = 2; function run() { let i = 0; while (i < 10) i = next }',
    )
    let value = find('Literal', '2')

    expect(isLoopAdvanceValue({ shared: new Set(), scopes, tree }, value)).toBe(
      true,
    )
    expect(
      isLoopAdvanceValue(
        { shared: new Set([parsed.program]), scopes, tree },
        value,
      ),
    ).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { scopes, tree } = createTestFile('done = true')
    let other = createTestFile('done = true')

    expect(() =>
      isLoopAdvanceValue(
        { shared: new Set(), scopes, tree },
        other.find('Literal'),
      ),
    ).toThrow('Node is not part of the runtime tree of the file.')
  })
})
