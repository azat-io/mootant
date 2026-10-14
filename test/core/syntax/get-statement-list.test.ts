import { describe, expect, it } from 'vitest'

import { getStatementList } from '../../../core/syntax/get-statement-list'
import { createTestFile } from '../../helpers/create-test-file'

describe('getStatementList', () => {
  it.each([
    { source: 'b(); a()', list: 'Program' },
    { list: 'BlockStatement', source: '{ a() }' },
    { source: 'function f() { a() }', list: 'BlockStatement' },
    { source: 'class C { static { a() } }', list: 'StaticBlock' },
    { source: 'namespace N { a() }', list: 'TSModuleBlock' },
  ] as const)('finds the body of the $list in $source', ({ source, list }) => {
    let { find, tree } = createTestFile(source)

    let statements = getStatementList(tree, find('ExpressionStatement', 'a()'))

    expect(statements).toBe(Reflect.get(find(list), 'body'))
  })

  it('finds the consequent of a switch case', () => {
    let { find, tree } = createTestFile('switch (x) { case 1: a() }')

    expect(getStatementList(tree, find('ExpressionStatement', 'a()'))).toBe(
      find('SwitchCase').consequent,
    )
  })

  it.each([
    { type: 'ExpressionStatement', source: 'if (x) a()', text: 'a()' },
    { type: 'ExpressionStatement', source: 'while (x) a()', text: 'a()' },
    { type: 'ExpressionStatement', source: 'l: a()', text: 'a()' },
    { source: 'switch (x) { case a: }', type: 'Identifier', text: 'a' },
    { type: 'Program', source: 'a()', text: 'a()' },
  ] as const)('returns null for $text in $source', ({ source, type, text }) => {
    let { find, tree } = createTestFile(source)

    expect(getStatementList(tree, find(type, text))).toBeNull()
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a()')
    let other = createTestFile('a()')

    expect(() =>
      getStatementList(tree, other.find('ExpressionStatement')),
    ).toThrow('Node is not part of the runtime tree of the file.')
  })
})
