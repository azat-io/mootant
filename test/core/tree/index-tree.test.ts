import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { createTestFile } from '../../helpers/create-test-file'
import { indexTree } from '../../../core/tree/index-tree'

/**
 * Indexed and dispatched nodes of a snippet, each described by its type and
 * text.
 */
interface IndexedSnippet {
  /**
   * Nodes in the dispatch order.
   */
  dispatched: string[]

  /**
   * Nodes with a slot, in the order of the walk.
   */
  indexed: string[]
}

/**
 * Parses a snippet that is known to be valid and indexes its runtime tree.
 *
 * @param source - Text of the snippet.
 * @param file - Name of the file, which selects the language.
 * @returns Descriptions of the indexed and the dispatched nodes.
 */
function indexSnippet(source: string, file = 'example.ts'): IndexedSnippet {
  let { program, text } = createTestFile(source, file).parsed
  let tree = indexTree(program)
  return {
    indexed: Array.from(tree.slots.keys(), node => describeNode(node, text)),
    dispatched: tree.order.map(node => describeNode(node, text)),
  }
}

/**
 * Describes a node by its type and text.
 *
 * @param node - Node to describe.
 * @param text - Text of the file the node belongs to.
 * @returns The type and the text of the node, separated by a space.
 */
function describeNode(node: Node, text: string): string {
  return `${node.type} ${text.slice(node.start, node.end)}`
}

describe('indexTree', () => {
  it('indexes and dispatches runtime nodes in pre-order', () => {
    expect(indexSnippet('let a = (b + 1)').dispatched).toStrictEqual([
      'Program let a = (b + 1)',
      'VariableDeclaration let a = (b + 1)',
      'VariableDeclarator a = (b + 1)',
      'Identifier a',
      'ParenthesizedExpression (b + 1)',
      'BinaryExpression b + 1',
      'Identifier b',
      'Literal 1',
    ])
  })

  it('records raw slots, parentheses included', () => {
    let tree = indexTree(createTestFile('((a))').parsed.program)
    let slots = Array.from(tree.slots.values(), slot => [
      slot.parent?.type ?? null,
      slot.key,
      slot.index,
    ])

    expect(slots).toStrictEqual([
      [null, null, null],
      ['Program', 'body', 0],
      ['ExpressionStatement', 'expression', null],
      ['ParenthesizedExpression', 'expression', null],
      ['ParenthesizedExpression', 'expression', null],
    ])
  })

  it.each([
    ['a variable annotation', 'let a: number = 1', 'TSNumberKeyword number'],
    [
      'a type annotation node',
      'let a: number = 1',
      'TSTypeAnnotation : number',
    ],
    [
      'a return type',
      "function f(): string { return '' }",
      'TSStringKeyword string',
    ],
    ['type parameters', 'function f<T>() {}', 'TSTypeParameter T'],
    ['type arguments', 'f<string>(a)', 'TSStringKeyword string'],
    [
      'type arguments of a superclass',
      'class A extends B<string> {}',
      'TSStringKeyword string',
    ],
    ['implements', 'class A implements C {}', 'TSClassImplements C'],
    ['decorators', '@dec class A {}', 'Identifier dec'],
    ['member decorators', 'class A { @dec m() {} }', 'Decorator @dec'],
    ['a namespace name', 'namespace N { f() }', 'Identifier N'],
    [
      'a qualified namespace name',
      'namespace N.M { f() }',
      'TSQualifiedName N.M',
    ],
    ['an import', "import a from './a'", "Literal './a'"],
    ['an import equals declaration', "import a = require('a')", "Literal 'a'"],
    ['a star export', "export * from './a'", "Literal './a'"],
    [
      'a namespace export',
      'export as namespace N',
      'TSNamespaceExportDeclaration export as namespace N',
    ],
    [
      'an interface',
      'interface A { a: number }',
      'TSInterfaceDeclaration interface A { a: number }',
    ],
    [
      'a type alias',
      'type A = string',
      'TSTypeAliasDeclaration type A = string',
    ],
    [
      'an overload signature',
      ['function f(): void', 'function f() {}'].join('\n'),
      'TSDeclareFunction function f(): void',
    ],
    ['a declared function', 'declare function f(): void', 'Identifier f'],
    [
      'an abstract method',
      'abstract class A { abstract m(): void }',
      'Identifier m',
    ],
    [
      'an abstract property',
      'abstract class A { abstract p: number }',
      'Identifier p',
    ],
    [
      'an abstract accessor',
      'abstract class A { abstract accessor q: number }',
      'Identifier q',
    ],
    [
      'an index signature',
      'class A { [key: string]: unknown }',
      'TSIndexSignature [key: string]: unknown',
    ],
    ['an enum', 'enum E { A = 1 << 2 }', 'BinaryExpression 1 << 2'],
    ['a const enum', 'const enum E { A = 1 }', 'Literal 1'],
    ['a declared variable', 'declare let a: number', 'Identifier a: number'],
    ['a declared class', 'declare class A { m(): void }', 'Identifier A'],
    [
      'a declared module',
      "declare module 'x' { let a: number }",
      "TSModuleDeclaration declare module 'x' { let a: number }",
    ],
    [
      'a global augmentation',
      ['export {}', 'declare global { let a: number }'].join('\n'),
      'TSModuleDeclaration declare global { let a: number }',
    ],
    ['a declared field', 'class A { declare a: number }', 'Identifier a'],
    ['a directive', ["'use strict'", 'f()'].join('\n'), "Literal 'use strict'"],
    ['an empty directive', ["''", 'f()'].join('\n'), "Literal ''"],
    [
      'a function directive',
      "function f() { 'use client' }",
      "ExpressionStatement 'use client'",
    ],
    [
      'a method overload',
      ['class A { m(): void', 'm() {} }'].join('\n'),
      'MethodDefinition m(): void',
    ],
    [
      'an export specifier',
      ['let a = 1', 'export { a }'].join('\n'),
      'ExportSpecifier a',
    ],
    ['a re-export source', "export { a } from './a'", "Literal './a'"],
    ['a dynamic import specifier', "import('./a')", "Literal './a'"],
    [
      'import attributes',
      "import('./a', { with: { type: 'json' } })",
      "ObjectExpression { with: { type: 'json' } }",
    ],
    ['a require specifier', "require('./a')", "Literal './a'"],
    ['a require.resolve specifier', "require.resolve('./a')", "Literal './a'"],
    ['a module.require specifier', "module.require('./a')", "Literal './a'"],
    [
      'an import.meta.resolve specifier',
      "import.meta.resolve('./a')",
      "Literal './a'",
    ],
    [
      'an import.meta.glob pattern',
      "import.meta.glob('./pages/*.ts')",
      "Literal './pages/*.ts'",
    ],
    [
      'an import.meta.glob pattern list',
      "import.meta.glob(['./a/*.ts', '!./a/b.ts'])",
      "Literal '!./a/b.ts'",
    ],
    [
      'import.meta.glob options',
      "import.meta.glob('./a/*.ts', { eager: true })",
      'Literal true',
    ],
    [
      'the callee of a logging call',
      "console.log('a', b)",
      'Identifier console',
    ],
    ['the arguments of a logging call', "console.log('a', b)", 'Identifier b'],
    ['a logger argument', 'this.logger.warn(message)', 'Identifier message'],
  ])('leaves out %s', (_description, source, node) => {
    expect(indexSnippet(source).indexed).not.toContain(node)
  })

  it.each([
    [
      'a logging call',
      "console.log('a', b)",
      "CallExpression console.log('a', b)",
    ],
    [
      'a dynamic import',
      "await import('./a')",
      "ImportExpression import('./a')",
    ],
    ['a require call', "require('./a')", "CallExpression require('./a')"],
    ['a second require argument', "require('./a', b)", 'Identifier b'],
    [
      'an import.meta.glob call',
      "import.meta.glob('./a/*.ts')",
      "CallExpression import.meta.glob('./a/*.ts')",
    ],
    ['an argument of another call', "load('./a')", "Literal './a'"],
    ['an argument of log.push', 'log.push(x)', 'Identifier x'],
    ['a parenthesized string', "('use strict')", "Literal 'use strict'"],
    [
      'a string after a statement',
      ['f()', "'use strict'"].join('\n'),
      "Literal 'use strict'",
    ],
    [
      'a method implementation',
      ['class A { m(): void', 'm() {} }'].join('\n'),
      'BlockStatement {}',
    ],
    ['an exported declaration', 'export const a = 1', 'Literal 1'],
    ['the operand of as', '(a + b) as number', 'BinaryExpression a + b'],
    ['the operand of satisfies', 'a satisfies T', 'Identifier a'],
    ['the operand of a type assertion', 'let a = <T>b', 'Identifier b'],
    ['the operand of a non-null assertion', 'a!', 'Identifier a'],
    ['an instantiation expression', 'f<T>', 'TSInstantiationExpression f<T>'],
    ['an element of as const', '[1, 2] as const', 'Literal 2'],
    ['code of a namespace', 'namespace N { f() }', 'CallExpression f()'],
    [
      'a parameter property default',
      'class A { constructor(private a = 1) {} }',
      'Literal 1',
    ],
    ['an export assignment', 'export = a + 1', 'BinaryExpression a + 1'],
    ['a default export', 'export default a + 1', 'BinaryExpression a + 1'],
    ['a class field', 'class A { static a = 1 }', 'Literal 1'],
    ['a static block', 'class A { static { f() } }', 'CallExpression f()'],
    ['a destructuring default', 'let { a = 1 } = b', 'Literal 1'],
    ['a computed key', '({ [k]: 1 })', 'Identifier k'],
    ['a computed member', 'a[b]', 'Identifier b'],
    ['a meta property', 'import.meta.url', 'MetaProperty import.meta'],
    ['a parenthesized expression', '(a)', 'ParenthesizedExpression (a)'],
  ])('dispatches %s', (_description, source, node) => {
    expect(indexSnippet(source).dispatched).toContain(node)
  })

  it('dispatches JSX', () => {
    expect(indexSnippet('<div>{a}</div>', 'example.tsx').dispatched).toEqual(
      expect.arrayContaining(['JSXElement <div>{a}</div>', 'Identifier a']),
    )
  })

  it.each([
    ['a property key', "({ a: 1, 'b-c': 2 })", 'Identifier a'],
    ['a string property key', "({ a: 1, 'b-c': 2 })", "Literal 'b-c'"],
    ['a method key', 'class A { get size() { return 1 } }', 'Identifier size'],
    ['a private field key', 'class A { #f = 1 }', 'PrivateIdentifier #f'],
    ['an accessor key', 'class A { accessor x = 1 }', 'Identifier x'],
    ['a member property', 'a.b', 'Identifier b'],
    [
      'a private member property',
      'class A { #f = 1; m() { this.#f } }',
      'PrivateIdentifier #f',
    ],
    ['a label', 'outer: for (;;) { break outer }', 'Identifier outer'],
    [
      'a continue label',
      'outer: for (;;) { continue outer }',
      'Identifier outer',
    ],
    [
      'the parts of new.target',
      'function f() { new.target }',
      'Identifier target',
    ],
    ['the parts of import.meta', 'import.meta.url', 'Identifier meta'],
  ])('indexes %s without dispatching it', (_description, source, node) => {
    let { dispatched, indexed } = indexSnippet(source)

    expect(indexed).toContain(node)
    expect(dispatched).not.toContain(node)
  })
})
