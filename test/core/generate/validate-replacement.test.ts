import { describe, expect, it } from 'vitest'

import { validateReplacement } from '../../../core/generate/validate-replacement'
import { createTestFile } from '../../helpers/create-test-file'

describe('validateReplacement', () => {
  it('rejects a node outside the runtime tree', () => {
    let { find, tree } = createTestFile("import a from 'm'")

    expect(validateReplacement(tree, find('Literal'))).toBe(
      'returned a replacement for a node outside the runtime code of the file.',
    )
  })

  it('rejects a node that is neither an expression nor a statement', () => {
    let { find, tree } = createTestFile('let a = 1')

    expect(validateReplacement(tree, find('VariableDeclaration'))).toBe(
      'cannot replace a VariableDeclaration node; replace an expression or a statement.',
    )
  })

  it('rejects an expression the mutant switch cannot wrap', () => {
    let { find, tree } = createTestFile('a = 1')

    expect(validateReplacement(tree, find('Identifier', 'a'))).toBe(
      'cannot replace a Identifier node in a position the mutant switch cannot wrap.',
    )
  })

  it('rejects the body of a labeled statement', () => {
    let { find, tree } = createTestFile('outer: for (;;) {}')

    expect(validateReplacement(tree, find('ForStatement'))).toBe(
      'cannot replace the body of a labeled statement; replace the LabeledStatement.',
    )
  })

  it.each([
    { source: 'function f() { a() }', slot: 'a function body', nth: 0 },
    { source: 'let f = () => { a() }', slot: 'an arrow body', nth: 0 },
    { source: 'try { a() } catch {}', slot: 'a try block', nth: 0 },
    { source: 'try {} catch { a() }', slot: 'a catch body', nth: 1 },
    { source: 'try {} finally { a() }', slot: 'a finally block', nth: 1 },
    { source: 'class A { m() { a() } }', slot: 'a method body', nth: 0 },
  ])('rejects a BlockStatement that is $slot', ({ source, nth }) => {
    let { find, tree } = createTestFile(source)

    expect(
      validateReplacement(tree, find('BlockStatement', undefined, nth)),
    ).toBe(
      'cannot replace a BlockStatement node in a position the mutant switch cannot wrap.',
    )
  })

  it.each([
    { slot: 'a Program element', source: '{ a() }' },
    { source: 'if (a) { b() }', slot: 'an if branch' },
    { source: 'if (a) b(); else { c() }', slot: 'an else branch' },
    { source: 'while (a) { b() }', slot: 'a loop body' },
    { source: 'switch (a) { case 1: { b() } }', slot: 'a case consequent' },
    {
      source: 'class A { static { { a() } } }',
      slot: 'a static block element',
    },
    { source: 'namespace N { { a() } }', slot: 'a namespace element' },
  ])('accepts a BlockStatement that is $slot', ({ source }) => {
    let { find, tree } = createTestFile(source)

    expect(validateReplacement(tree, find('BlockStatement'))).toBeNull()
  })

  it.each([
    { type: 'BinaryExpression', source: 'x = a + 1' },
    { source: 'outer: for (;;) {}', type: 'LabeledStatement' },
    { type: 'ExpressionStatement', source: 'a()' },
    { type: 'ExpressionStatement', source: 'if (a) b()' },
  ] as const)('accepts a $type in $source', ({ source, type }) => {
    let { find, tree } = createTestFile(source)

    expect(validateReplacement(tree, find(type))).toBeNull()
  })
})
