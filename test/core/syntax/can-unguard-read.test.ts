import { describe, expect, it } from 'vitest'

import { canUnguardRead } from '../../../core/syntax/can-unguard-read'
import { createTestFile } from '../../helpers/create-test-file'

describe('canUnguardRead', () => {
  it.each([
    {
      source: 'setTimeout(run, options && options.delay)',
      node: 'options && options.delay',
      replacement: 'options.delay',
      type: 'LogicalExpression',
    },
    {
      source: 'setTimeout(run, options && options.delay)',
      replacement: 'options || options.delay',
      node: 'options && options.delay',
      type: 'LogicalExpression',
    },
    {
      source: 'setTimeout(run, options ? options.delay : 0)',
      replacement: 'true',
      type: 'Identifier',
      node: 'options',
    },
    {
      source: 'setTimeout(run, options ? options.delay : 0)',
      node: 'options ? options.delay : 0',
      type: 'ConditionalExpression',
      replacement: 'options.delay',
    },
    {
      source: 'setTimeout(run, options != null ? options.delay : 0)',
      replacement: 'options == null',
      type: 'BinaryExpression',
      node: 'options != null',
    },
    {
      source: 'setTimeout(run, options?.delay ?? 1000)',
      replacement: 'options.delay',
      type: 'ChainExpression',
      node: 'options?.delay',
    },
    {
      source: 'setTimeout(run, ready || options[key])',
      replacement: 'false',
      type: 'Identifier',
      node: 'ready',
    },
    {
      source: 'setTimeout(run, delays[0].ms)',
      replacement: '1',
      type: 'Literal',
      node: '0',
    },
    {
      source: 'setTimeout(run, (options || defaults).delay)',
      replacement: 'options && defaults',
      node: 'options || defaults',
      type: 'LogicalExpression',
    },
    {
      source: 'setTimeout(run, a?.b.c)',
      type: 'Identifier',
      replacement: 'x',
      node: 'a',
    },
    {
      source: "setTimeout(run, 'delay' in (options || {}) ? 1 : 2)",
      replacement: 'options && {}',
      type: 'LogicalExpression',
      node: 'options || {}',
    },
    {
      source: 'setTimeout(run, value instanceof (Type || Object) ? 1 : 2)',
      replacement: 'Type && Object',
      type: 'LogicalExpression',
      node: 'Type || Object',
    },
    {
      source: "setTimeout(run, typeof DELAY !== 'undefined' && DELAY)",
      node: "typeof DELAY !== 'undefined' && DELAY",
      type: 'LogicalExpression',
      replacement: 'DELAY',
    },
    {
      source: "setTimeout(run, typeof DELAY === 'number' ? DELAY : 1000)",
      node: "typeof DELAY === 'number'",
      type: 'BinaryExpression',
      replacement: 'true',
    },
    {
      source: "setTimeout(run, typeof ms === 'number' ? ms * 1000 : 0)",
      node: "typeof ms === 'number'",
      type: 'BinaryExpression',
      replacement: 'true',
    },
    {
      source: "setTimeout(run, typeof d === 'symbol' ? 0 : d + 's')",
      node: "typeof d === 'symbol'",
      type: 'BinaryExpression',
      replacement: 'false',
    },
    {
      source: 'setTimeout(run, value instanceof Date ? value : 0)',
      node: 'value instanceof Date',
      type: 'BinaryExpression',
      replacement: 'true',
    },
    {
      type: 'LogicalExpression',
      source: 'a && a.b',
      replacement: 'a.b',
      node: 'a && a.b',
    },
  ] as const)(
    'accepts $node -> $replacement in $source',
    ({ replacement, source, type, node }) => {
      let { sourceCode, find, tree } = createTestFile(source)

      expect(
        canUnguardRead(
          tree,
          { node: find(type, node), text: replacement },
          sourceCode.text,
        ),
      ).toBe(true)
    },
  )

  it.each([
    {
      source: 'setTimeout(run, 1000)',
      replacement: '1001',
      type: 'Literal',
      node: '1000',
    },
    {
      source: 'setTimeout(run, base * 2)',
      type: 'BinaryExpression',
      replacement: 'base / 2',
      node: 'base * 2',
    },
    {
      source: 'setTimeout(run, options.delay * 2)',
      replacement: 'options.delay / 2',
      node: 'options.delay * 2',
      type: 'BinaryExpression',
    },
    {
      source: 'setTimeout(run, options ? options.delay : 1000)',
      replacement: '1001',
      type: 'Literal',
      node: '1000',
    },
    {
      source: 'setTimeout(run, options && options.delay)',
      node: 'options && options.delay',
      type: 'LogicalExpression',
      replacement: 'options',
    },
    {
      source: 'setTimeout(run, options?.delay ?? 1000)',
      node: 'options?.delay ?? 1000',
      type: 'LogicalExpression',
      replacement: '1000',
    },
    {
      source: 'setTimeout(run, options?.delay ?? 1000)',
      replacement: 'options?.delay || 1000',
      node: 'options?.delay ?? 1000',
      type: 'LogicalExpression',
    },
    {
      source: 'setTimeout(run, (options?.delay ?? 1) * 1000)',
      replacement: '(options?.delay ?? 1) / 1000',
      node: '(options?.delay ?? 1) * 1000',
      type: 'BinaryExpression',
    },
    {
      source: 'setTimeout(run, quick ? 1 : 4000)',
      replacement: 'true',
      type: 'Identifier',
      node: 'quick',
    },
    {
      source: 'setTimeout(run, seconds > 1 ? 1000 : 0)',
      replacement: 'seconds >= 1',
      type: 'BinaryExpression',
      node: 'seconds > 1',
    },
    {
      source: 'setTimeout(run, (options || defaults)?.delay)',
      replacement: 'options && defaults',
      node: 'options || defaults',
      type: 'LogicalExpression',
    },
    {
      source: "setTimeout(run, typeof ms === 'number' ? 1000 : 0)",
      node: "typeof ms === 'number'",
      type: 'BinaryExpression',
      replacement: 'true',
    },
    {
      source: "setTimeout(run, typeof ms === 'number' ? ms * 1000 : 0)",
      replacement: '1001',
      type: 'Literal',
      node: '1000',
    },
    {
      source: 'let f = () => (a ? a.b : 0)',
      replacement: '1',
      type: 'Literal',
      node: '0',
    },
  ] as const)(
    'rejects $node -> $replacement in $source',
    ({ replacement, source, type, node }) => {
      let { sourceCode, find, tree } = createTestFile(source)

      expect(
        canUnguardRead(
          tree,
          { node: find(type, node), text: replacement },
          sourceCode.text,
        ),
      ).toBe(false)
    },
  )

  it('stops at the root of the tree', () => {
    let { sourceCode, find, tree } = createTestFile('1000')

    expect(
      canUnguardRead(
        tree,
        { node: find('Program'), text: '' },
        sourceCode.text,
      ),
    ).toBe(false)
  })
})
