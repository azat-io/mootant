import { describe, expect, it } from 'vitest'

import { getReplacementKind } from '../../../core/generate/get-replacement-kind'
import { createTestFile } from '../../helpers/create-test-file'

describe('getReplacementKind', () => {
  it.each([
    { type: 'BlockStatement', file: 'example.ts', source: '{}' },
    { source: 'for (;;) break', type: 'BreakStatement', file: 'example.ts' },
    {
      source: 'for (;;) continue',
      type: 'ContinueStatement',
      file: 'example.ts',
    },
    { type: 'DebuggerStatement', source: 'debugger', file: 'example.ts' },
    {
      source: 'do {} while (a)',
      type: 'DoWhileStatement',
      file: 'example.ts',
    },
    { type: 'EmptyStatement', file: 'example.ts', source: ';' },
    { type: 'ExpressionStatement', file: 'example.ts', source: 'a' },
    { source: 'for (k in o) {}', type: 'ForInStatement', file: 'example.ts' },
    { source: 'for (v of a) {}', type: 'ForOfStatement', file: 'example.ts' },
    { source: 'for (;;) {}', type: 'ForStatement', file: 'example.ts' },
    { type: 'IfStatement', source: 'if (a) {}', file: 'example.ts' },
    { type: 'LabeledStatement', file: 'example.ts', source: 'l: a' },
    {
      source: 'function f() { return }',
      type: 'ReturnStatement',
      file: 'example.ts',
    },
    { source: 'switch (a) {}', type: 'SwitchStatement', file: 'example.ts' },
    { type: 'ThrowStatement', file: 'example.ts', source: 'throw a' },
    { source: 'try {} catch {}', type: 'TryStatement', file: 'example.ts' },
    { source: 'while (a) {}', type: 'WhileStatement', file: 'example.ts' },
    { source: 'with (a) {}', type: 'WithStatement', file: 'example.js' },
  ] as const)('gives block for a $type', ({ source, type, file }) => {
    let { find } = createTestFile(source, file)

    expect(getReplacementKind(find(type))).toBe('block')
  })

  it.each([
    { type: 'ArrayExpression', file: 'example.ts', source: 'x = []' },
    {
      type: 'ArrowFunctionExpression',
      source: 'x = () => 1',
      file: 'example.ts',
    },
    { type: 'AssignmentExpression', file: 'example.ts', source: 'a = 1' },
    {
      source: 'async function f() { await a }',
      type: 'AwaitExpression',
      file: 'example.ts',
    },
    { type: 'BinaryExpression', file: 'example.ts', source: 'a + b' },
    { type: 'CallExpression', file: 'example.ts', source: 'f()' },
    { type: 'ChainExpression', file: 'example.ts', source: 'a?.b' },
    { type: 'ClassExpression', source: 'x = class {}', file: 'example.ts' },
    {
      type: 'ConditionalExpression',
      source: 'a ? b : c',
      file: 'example.ts',
    },
    {
      source: 'x = function () {}',
      type: 'FunctionExpression',
      file: 'example.ts',
    },
    { type: 'Identifier', file: 'example.ts', source: 'a' },
    { type: 'ImportExpression', source: "import('m')", file: 'example.ts' },
    { file: 'example.tsx', type: 'JSXElement', source: '<a />' },
    { type: 'JSXFragment', file: 'example.tsx', source: '<></>' },
    { file: 'example.ts', type: 'Literal', source: '1' },
    { type: 'LogicalExpression', file: 'example.ts', source: 'a && b' },
    { type: 'MemberExpression', file: 'example.ts', source: 'a.b' },
    {
      source: 'function f() { new.target }',
      type: 'MetaProperty',
      file: 'example.ts',
    },
    { type: 'NewExpression', file: 'example.ts', source: 'new A()' },
    { type: 'ObjectExpression', file: 'example.ts', source: 'x = {}' },
    { type: 'SequenceExpression', file: 'example.ts', source: 'a, b' },
    {
      type: 'TaggedTemplateExpression',
      file: 'example.ts',
      source: 'tag`x`',
    },
    { type: 'TemplateLiteral', file: 'example.ts', source: '`x`' },
    { type: 'ThisExpression', file: 'example.ts', source: 'this' },
    { type: 'TSAsExpression', file: 'example.ts', source: 'a as T' },
    {
      type: 'TSInstantiationExpression',
      file: 'example.ts',
      source: 'f<T>',
    },
    { type: 'TSNonNullExpression', file: 'example.ts', source: 'a!' },
    {
      type: 'TSSatisfiesExpression',
      source: 'a satisfies T',
      file: 'example.ts',
    },
    { type: 'TSTypeAssertion', file: 'example.ts', source: '<T>a' },
    { type: 'UnaryExpression', file: 'example.ts', source: '-a' },
    { type: 'UpdateExpression', file: 'example.ts', source: 'a++' },
    {
      source: 'function* g() { yield a }',
      type: 'YieldExpression',
      file: 'example.ts',
    },
  ] as const)('gives expression for a $type', ({ source, type, file }) => {
    let { find } = createTestFile(source, file)

    expect(getReplacementKind(find(type))).toBe('expression')
  })

  it.each([
    { type: 'ParenthesizedExpression', file: 'example.ts', source: '(a)' },
    { type: 'VariableDeclaration', source: 'let a = 1', file: 'example.ts' },
    {
      type: 'FunctionDeclaration',
      source: 'function f() {}',
      file: 'example.ts',
    },
    { type: 'ClassDeclaration', source: 'class A {}', file: 'example.ts' },
    {
      type: 'ExportNamedDeclaration',
      source: 'export let a = 1',
      file: 'example.ts',
    },
    {
      type: 'ExportDefaultDeclaration',
      source: 'export default 1',
      file: 'example.ts',
    },
    {
      type: 'TSModuleDeclaration',
      source: 'namespace N {}',
      file: 'example.ts',
    },
    { source: 'x = { a: 1 }', file: 'example.ts', type: 'Property' },
    {
      source: 'switch (a) { case 1: }',
      type: 'SwitchCase',
      file: 'example.ts',
    },
    {
      source: 'class A { static {} }',
      type: 'StaticBlock',
      file: 'example.ts',
    },
    {
      source: 'class A { m() {} }',
      type: 'MethodDefinition',
      file: 'example.ts',
    },
    {
      source: 'class A { p = 1 }',
      type: 'PropertyDefinition',
      file: 'example.ts',
    },
    { source: 'let [a] = b', type: 'ArrayPattern', file: 'example.ts' },
    { source: 'let { a } = b', type: 'ObjectPattern', file: 'example.ts' },
    { type: 'SpreadElement', source: 'x = [...a]', file: 'example.ts' },
    { type: 'TemplateElement', file: 'example.ts', source: '`x`' },
    {
      source: 'class A extends B { constructor() { super() } }',
      file: 'example.ts',
      type: 'Super',
    },
    {
      source: 'class A { #p = 1 }',
      type: 'PrivateIdentifier',
      file: 'example.ts',
    },
    { source: '<a b="c" />', type: 'JSXAttribute', file: 'example.tsx' },
    { file: 'example.tsx', source: '<a>t</a>', type: 'JSXText' },
    { file: 'example.ts', type: 'Program', source: 'a' },
  ] as const)('gives null for a $type', ({ source, type, file }) => {
    let { find } = createTestFile(source, file)

    expect(getReplacementKind(find(type))).toBeNull()
  })
})
