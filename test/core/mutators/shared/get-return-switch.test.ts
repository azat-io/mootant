import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getReturnSwitch } from '../../../../core/mutators/shared/get-return-switch'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getReturnSwitch', () => {
  it.each<[string, string[]]>([
    [
      'function f() { if (x) return true; return false }',
      ['x', 'true', 'false'],
    ],
    [
      "function f() { a(); if ((x)) { return 'a' } return (1) }",
      ['x', "'a'", '1'],
    ],
    ['function f() { if (x) return -1; else return `b` }', ['x', '-1', '`b`']],
    [
      'function f() { if (x) { return 0n } else { return 1 } }',
      ['x', '0n', '1'],
    ],
  ])('finds the switch of %s', (source, expected) => {
    let { context, find } = createTestContext(source)
    let found = getReturnSwitch(find('FunctionDeclaration'))!

    expect(
      [found.test, found.consequent, found.alternate].map(part =>
        context.sourceCode.getText(part),
      ),
    ).toEqual(expected)
    expect(found.statement).toBe(find('IfStatement'))
  })

  it.each<[string, Node['type']]>([
    ['function f() { if (x) return true; foo() }', 'FunctionDeclaration'],
    ['function f() { if (x) return true; return y }', 'FunctionDeclaration'],
    ['function f() { if (x) return y; return true }', 'FunctionDeclaration'],
    [
      'function f() { if (x) return 1; else foo(); return 2 }',
      'FunctionDeclaration',
    ],
    ['function f() { if (x) return 1; { return 2 } }', 'FunctionDeclaration'],
    [
      'function f() { if (x) return 1; else if (y) return 2; else return 3 }',
      'FunctionDeclaration',
    ],
    [
      'function f() { if (y) return 0; if (x) return 1; return 2 }',
      'FunctionDeclaration',
    ],
    [
      'function f() { if (x) { foo(); return 1 } return 2 }',
      'FunctionDeclaration',
    ],
    ['function f() { if (x) return 1 }', 'FunctionDeclaration'],
    ['function f() { foo(); return 2 }', 'FunctionDeclaration'],
    ['function f() {}', 'FunctionDeclaration'],
    ['x = () => true', 'ArrowFunctionExpression'],
  ])('finds no switch in %s', (source, type) => {
    let { find } = createTestContext(source)

    expect(
      getReturnSwitch(find(type) as Parameters<typeof getReturnSwitch>[0]),
    ).toBeNull()
  })
})
