import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getFunctionReturns } from '../../../../core/mutators/shared/get-function-returns'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getFunctionReturns', () => {
  it.each<[string, Node['type'], string[]]>([
    [
      'function f() { if (a) return 1; let g = () => { return 2 }; return 3 }',
      'FunctionDeclaration',
      ['return 1;', 'return 3'],
    ],
    [
      'x = function () { class A { m() { return 1 } }; while (a) { return } }',
      'FunctionExpression',
      ['return'],
    ],
    ['x = () => 1', 'ArrowFunctionExpression', []],
    ['x = () => { a() }', 'ArrowFunctionExpression', []],
  ])('collects the returns of %s', (source, type, expected) => {
    let { context, find } = createTestContext(source)
    let returns = getFunctionReturns(
      find(type) as Parameters<typeof getFunctionReturns>[0],
    )

    expect(
      returns.map(statement => context.sourceCode.getText(statement)),
    ).toEqual(expected)
  })
})
