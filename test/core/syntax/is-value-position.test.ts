import { describe, expect, it } from 'vitest'

import { isValuePosition } from '../../../core/syntax/is-value-position'
import { createTestFile } from '../../helpers/create-test-file'

describe('isValuePosition', () => {
  it.each([
    { source: 'x = { b: a }', type: 'Identifier', text: 'a' },
    {
      type: 'ArrowFunctionExpression',
      source: 'x = { m: () => a }',
      text: '() => a',
    },
    {
      source: 'x = { m: function () {} }',
      type: 'FunctionExpression',
      text: 'function () {}',
    },
    { source: 'x = { [a]: 1 }', type: 'Identifier', text: 'a' },
    { source: 'class C { [a]() {} }', type: 'Identifier', text: 'a' },
    { source: 'x = b[a]', type: 'Identifier', text: 'a' },
    { type: 'Identifier', source: 'x = a.b', text: 'a' },
    { type: 'MemberExpression', source: 'x = a.b', text: 'a.b' },
    { source: '({ b = a } = x)', type: 'Identifier', text: 'a' },
    { source: 'function f(b = a) {}', type: 'Identifier', text: 'a' },
    { type: 'Identifier', source: 'a()', text: 'a' },
    { type: 'Identifier', source: 'a`x`', text: 'a' },
    { type: 'MemberExpression', source: 'new a.B()', text: 'a.B' },
    { type: 'SequenceExpression', source: '(0, a.b)()', text: '0, a.b' },
    { type: 'Identifier', source: 'f(a)', text: 'a' },
    { source: 'x = typeof a.b', type: 'MemberExpression', text: 'a.b' },
    { source: 'x = void a', type: 'Identifier', text: 'a' },
    { type: 'Identifier', source: 'x = !a', text: 'a' },
    { source: 'x = a + b', type: 'Identifier', text: 'a' },
    { source: 'x = a?.b.c', type: 'Identifier', text: 'a' },
    { type: 'MemberExpression', source: 'x = a.b?.c', text: 'a.b' },
    { source: 'x = f().b?.c', type: 'CallExpression', text: 'f()' },
    { type: 'ChainExpression', source: 'x = a?.b.c', text: 'a?.b.c' },
    { source: 'x = a satisfies T', type: 'Identifier', text: 'a' },
    {
      type: 'TSSatisfiesExpression',
      source: 'x = a satisfies T',
      text: 'a satisfies T',
    },
    { source: 'x = [1, 2] as const', type: 'Literal', text: '1' },
    { type: 'Identifier', source: 'x = (a)', text: 'a' },
    { source: 'x = import.meta', type: 'MetaProperty', text: 'import.meta' },
    { type: 'TemplateLiteral', source: 'x = `a`', text: '`a`' },
    { type: 'ThisExpression', source: 'x = this', text: 'this' },
  ] as const)('accepts $text in $source', ({ source, type, text }) => {
    let { find, tree } = createTestFile(source)

    expect(isValuePosition(tree, find(type, text))).toBe(true)
  })

  it.each([
    { type: 'Identifier', source: 'a = 1', text: 'a' },
    { type: 'MemberExpression', source: 'a.b = 1', text: 'a.b' },
    { source: '(a as T) = 1', type: 'Identifier', text: 'a' },
    { source: '(a as T) = 1', type: 'TSAsExpression', text: 'a as T' },
    { source: 'for (a in b) {}', type: 'Identifier', text: 'a' },
    { source: 'for (a of b) {}', type: 'Identifier', text: 'a' },
    { source: '[a = 1] = b', type: 'Identifier', text: 'a' },
    { type: 'Identifier', source: 'a++', text: 'a' },
    { type: 'Identifier', source: '[a] = b', text: 'a' },
    { source: '[...a] = b', type: 'Identifier', text: 'a' },
    { source: '({ b: a } = c)', type: 'Identifier', text: 'a' },
    { source: 'let a = 1', type: 'Identifier', text: 'a' },
    { source: 'function f(a) {}', type: 'Identifier', text: 'a' },
    { source: 'try {} catch (a) {}', type: 'Identifier', text: 'a' },
    { source: 'x = function a() {}', type: 'Identifier', text: 'a' },
    {
      source: 'class C { constructor(private a) {} }',
      type: 'Identifier',
      text: 'a',
    },
    { source: 'x = { a: 1 }', type: 'Identifier', text: 'a' },
    { type: 'Identifier', source: 'x = b.a', text: 'a' },
    { source: 'class C { a = 1 }', type: 'Identifier', text: 'a' },
    { source: 'class C { a() {} }', type: 'Identifier', text: 'a' },
    { source: 'class C { accessor a = 1 }', type: 'Identifier', text: 'a' },
    { source: 'a: for (;;) {}', type: 'Identifier', text: 'a' },
    { source: 'a: for (;;) { break a }', type: 'Identifier', text: 'a' },
    { source: 'x = import.meta', type: 'Identifier', text: 'meta' },
    { type: 'FunctionExpression', source: 'x = { m() {} }', text: '() {}' },
    {
      source: 'x = { get m() { return 1 } }',
      type: 'FunctionExpression',
      text: '() { return 1 }',
    },
    { source: 'class C { m() {} }', type: 'FunctionExpression', text: '() {}' },
    { type: 'MemberExpression', source: 'delete a.b', text: 'a.b' },
    { source: 'x = typeof a', type: 'Identifier', text: 'a' },
    { source: 'x = typeof (a)', type: 'Identifier', text: 'a' },
    { type: 'TemplateLiteral', source: 'a`x`', text: '`x`' },
    { type: 'MemberExpression', source: 'a.b`x`', text: 'a.b' },
    { type: 'MemberExpression', source: 'a.b()', text: 'a.b' },
    { source: '(a.b as T)()', type: 'TSAsExpression', text: 'a.b as T' },
    { type: 'ChainExpression', source: '(a?.b)()', text: 'a?.b' },
    { source: "eval('x')", type: 'Identifier', text: 'eval' },
    { type: 'MemberExpression', source: 'x = a?.b.c', text: 'a?.b' },
    { type: 'MemberExpression', source: 'x = a?.b.c', text: 'a?.b.c' },
    { type: 'TSNonNullExpression', source: 'x = a?.b!.c', text: 'a?.b!' },
    { type: 'CallExpression', source: 'x = a?.().b', text: 'a?.()' },
    { source: 'x = a?.b().c', type: 'CallExpression', text: 'a?.b()' },
    { type: 'ParenthesizedExpression', source: 'x = (a)', text: '(a)' },
    { type: 'SpreadElement', source: 'f(...a)', text: '...a' },
    { source: 'function f() {}', type: 'BlockStatement', text: '{}' },
    { type: 'Program', source: 'a', text: 'a' },
  ] as const)('rejects $text in $source', ({ source, type, text }) => {
    let { find, tree } = createTestFile(source)

    expect(isValuePosition(tree, find(type, text))).toBe(false)
  })

  it('rejects the value of a shorthand property', () => {
    let { find, tree } = createTestFile('x = { a }')

    expect(isValuePosition(tree, find('Identifier', 'a', 1))).toBe(false)
  })

  it.each([
    { source: '<a b={c} />', type: 'Identifier', expected: true, text: 'c' },
    { source: '<a>{c}</a>', type: 'Identifier', expected: true, text: 'c' },
    { source: '<a b="c" />', type: 'Literal', expected: false, text: '"c"' },
    {
      source: '<a b=<c /> />',
      type: 'JSXElement',
      expected: false,
      text: '<c />',
    },
    {
      source: '<a><c /></a>',
      type: 'JSXElement',
      expected: false,
      text: '<c />',
    },
    {
      source: '<><c /></>',
      type: 'JSXElement',
      expected: false,
      text: '<c />',
    },
    { source: 'x = <a />', type: 'JSXElement', expected: true, text: '<a />' },
  ] as const)(
    'tells whether $text in $source is a value position',
    ({ expected, source, type, text }) => {
      let { find, tree } = createTestFile(source, 'example.tsx')

      expect(isValuePosition(tree, find(type, text))).toBe(expected)
    },
  )

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('x = a')
    let other = createTestFile('x = a')

    expect(() => isValuePosition(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
