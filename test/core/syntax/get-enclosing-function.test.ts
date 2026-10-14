import { describe, expect, it } from 'vitest'

import { getEnclosingFunction } from '../../../core/syntax/get-enclosing-function'
import { createTestFile } from '../../helpers/create-test-file'

describe('getEnclosingFunction', () => {
  it.each([
    { source: 'function f() { a }', type: 'FunctionDeclaration' },
    { source: 'function f(x = a) {}', type: 'FunctionDeclaration' },
    {
      source: 'x = function () { if (b) { (a) } }',
      type: 'FunctionExpression',
    },
    { type: 'ArrowFunctionExpression', source: 'x = () => a' },
    {
      source: 'function f() { return () => a }',
      type: 'ArrowFunctionExpression',
    },
    { source: 'class C { m() { a } }', type: 'FunctionExpression' },
  ] as const)('finds the $type around a in $source', ({ source, type }) => {
    let { find, tree } = createTestFile(source)

    expect(getEnclosingFunction(tree, find('Identifier', 'a'))).toBe(find(type))
  })

  it.each(['a', 'if (b) { (a) }', 'class C { x = a }'])(
    'returns null at the top level of %s',
    source => {
      let { find, tree } = createTestFile(source)

      expect(getEnclosingFunction(tree, find('Identifier', 'a'))).toBeNull()
    },
  )

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a')
    let other = createTestFile('a')

    expect(() =>
      getEnclosingFunction(tree, other.find('Identifier', 'a')),
    ).toThrow('Node is not part of the runtime tree of the file.')
  })
})
