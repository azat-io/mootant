import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { ScopeAnalysis } from '../../../types/syntax/scope-analysis'
import type { Binding } from '../../../types/syntax/binding'

import { analyzeScopes } from '../../../core/hints/analyze-scopes'
import { createTestFile } from '../../helpers/create-test-file'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Scope analysis of a snippet with lookups by name and text.
 */
interface AnalyzedSnippet {
  /**
   * Lists the identifiers with a name, in pre-order.
   *
   * @param name - Name of the identifiers.
   * @returns The identifiers.
   */
  names(name: string): Node[]

  /**
   * Finds the first node with the text, outermost first.
   *
   * @param text - Text of the node.
   * @returns The node.
   */
  find(text: string): Node

  /**
   * Scope analysis of the snippet.
   */
  scopes: ScopeAnalysis

  /**
   * Text of the snippet.
   */
  text: string
}

/**
 * Parses a snippet and analyzes its scopes. A snippet that does not parse fails
 * the test.
 *
 * @param source - Text of the snippet.
 * @returns The analysis and lookups.
 */
function analyze(source: string): AnalyzedSnippet {
  let { program, text } = createTestFile(source).parsed
  let nodes: Node[] = []
  walkTree(program, node => {
    nodes.push(node)
    return true
  })
  return {
    find(nodeText: string): Node {
      let found = nodes.find(
        node =>
          node.type !== 'ExpressionStatement' &&
          text.slice(node.start, node.end) === nodeText,
      )
      if (!found) {
        throw new Error(`No node with the text ${nodeText}.`)
      }
      return found
    },
    names(name: string): Node[] {
      return nodes.filter(
        node => node.type === 'Identifier' && node.name === name,
      )
    },
    scopes: analyzeScopes(program),
    text,
  }
}

/**
 * Resolves one identifier of a snippet.
 *
 * @param source - Text of the snippet.
 * @param name - Name of the identifier.
 * @param index - Position of the identifier among those with the name.
 * @returns Position of the identifier that declares its binding among those
 *   with the name, or null when it has no binding.
 */
function resolve(source: string, name: string, index: number): number | null {
  let { scopes, names } = analyze(source)
  let identifiers = names(name)
  let binding = scopes.bindings.get(identifiers[index]!)
  return binding ? identifiers.indexOf(binding.identifier) : null
}

/**
 * Describes the owners of a type parameter by their type and first line.
 *
 * @param scopes - Scope analysis of a snippet.
 * @param name - Name of the type parameter.
 * @param text - Text of the snippet.
 * @returns The type and the first line of the text of each owner.
 */
function describeOwners(
  scopes: ScopeAnalysis,
  name: string,
  text: string,
): string[] {
  return scopes.typeParameters.get(name)!.map(node => {
    let [line] = text.slice(node.start, node.end).split('\n', 1)
    return `${node.type} ${line}`
  })
}

/**
 * Finds the binding a name declares in a snippet.
 *
 * @param source - Text of the snippet.
 * @param name - Declared name; its first identifier must declare it.
 * @returns The binding with the snippet's text.
 */
function getBinding(
  source: string,
  name: string,
): { binding: Binding; text: string } {
  let { scopes, names, text } = analyze(source)
  return { binding: scopes.bindings.get(names(name)[0]!)!, text }
}

/**
 * Describes nodes by their type and text.
 *
 * @param nodes - Nodes to describe.
 * @param text - Text of the snippet.
 * @returns The type and the text of each node.
 */
function describeNodes(nodes: readonly Node[], text: string): string[] {
  return nodes.map(node => `${node.type} ${text.slice(node.start, node.end)}`)
}

describe('analyzeScopes', () => {
  it.each([
    {
      title: 'a var used before its block declaration',
      source: 'x; { var x = 1 }',
      expected: 1,
      name: 'x',
      index: 0,
    },
    {
      source: 'function f() { x; { var x } }; x',
      title: 'a var inside a function',
      expected: 1,
      name: 'x',
      index: 0,
    },
    {
      title: 'a var outside its function',
      source: 'function f() { var x }; x',
      expected: null,
      name: 'x',
      index: 1,
    },
    {
      source: 'let a = 1; { let a = 2; a }',
      title: 'an inner block let',
      expected: 1,
      name: 'a',
      index: 2,
    },
    {
      source: 'let a = 1; { let a = 2 } a',
      title: 'an outer let after a block',
      expected: 0,
      name: 'a',
      index: 2,
    },
    {
      source: 'let p = 1; function f(p) { p }',
      title: 'a parameter shadowing a let',
      expected: 1,
      name: 'p',
      index: 2,
    },
    {
      title: 'a body var named like a parameter',
      source: 'function f(p) { var p; p }',
      expected: 0,
      name: 'p',
      index: 2,
    },
    {
      title: 'a body function named like a parameter',
      source: 'function f(p) { function p() {} p }',
      expected: 1,
      name: 'p',
      index: 2,
    },
    {
      source: 'let b = 1; function f(a = b) { let b = 2; b }',
      title: 'a parameter default beside a body let',
      expected: 0,
      name: 'b',
      index: 1,
    },
    {
      source: 'let b = 1; function f(a = b) { let b = 2; b }',
      title: 'a body let beside a parameter default',
      expected: 2,
      name: 'b',
      index: 3,
    },
    {
      source: 'let b = 1; function f(a = b) { var b }',
      title: 'a parameter default beside a body var',
      expected: 0,
      name: 'b',
      index: 1,
    },
    {
      source: 'let b = 1; function f(a = b) { function b() {} }',
      title: 'a parameter default beside a body function',
      expected: 0,
      name: 'b',
      index: 1,
    },
    {
      source: 'let b = 1; let f = (a = b) => { class b {} }',
      title: 'a parameter default beside a body class',
      expected: 0,
      name: 'b',
      index: 1,
    },
    {
      title: 'a computed key of a parameter pattern beside a body const',
      source: "let k = 'a'; function f({ [k]: v }) { const k = 1 }",
      expected: 0,
      name: 'k',
      index: 1,
    },
    {
      title: 'a default inside a parameter pattern beside a body let',
      source: 'let d = 1; function f({ v = d }) { let d }',
      expected: 0,
      name: 'd',
      index: 1,
    },
    {
      title: 'a parameter default reading an earlier parameter',
      source: 'function f(a, b = a) {}',
      expected: 0,
      name: 'a',
      index: 1,
    },
    {
      title: 'a named function expression',
      source: 'let g = function h() { h }',
      expected: 0,
      name: 'h',
      index: 1,
    },
    {
      source: 'let g = function h() {}; h',
      title: 'a function name outside',
      expected: null,
      name: 'h',
      index: 1,
    },
    {
      source: 'let c = class K { m() { K } }',
      title: 'a class expression name',
      expected: 0,
      name: 'K',
      index: 1,
    },
    {
      source: 'let c = class K {}; K',
      title: 'a class name outside',
      expected: null,
      name: 'K',
      index: 1,
    },
    {
      source: 'new A(); class A {}',
      title: 'a class declaration',
      expected: 1,
      name: 'A',
      index: 0,
    },
    {
      title: 'a function declaration',
      source: 'f(); function f() {}',
      expected: 1,
      name: 'f',
      index: 0,
    },
    {
      source: 'try {} catch (e) { e }',
      title: 'a catch parameter',
      expected: 0,
      name: 'e',
      index: 1,
    },
    {
      title: 'a catch parameter outside',
      source: 'try {} catch (e) {} e',
      expected: null,
      name: 'e',
      index: 1,
    },
    {
      title: 'a catch without a parameter',
      source: 'try {} catch { let e; e }',
      expected: 0,
      name: 'e',
      index: 1,
    },
    {
      title: 'a destructured catch parameter',
      source: 'try {} catch ({ m }) { m }',
      expected: 1,
      name: 'm',
      index: 2,
    },
    {
      source: 'for (let i = 0; i < 1; i++) { i }',
      title: 'a for loop variable',
      expected: 0,
      name: 'i',
      index: 3,
    },
    {
      title: 'a for loop variable after the loop',
      source: 'for (let i = 0; ; ) {} i',
      expected: null,
      name: 'i',
      index: 1,
    },
    {
      source: 'for (const v of v) { v }',
      title: 'a for...of variable',
      expected: 0,
      name: 'v',
      index: 2,
    },
    {
      source: 'switch (1) { case 1: let w; w }',
      title: 'a switch case declaration',
      expected: 0,
      name: 'w',
      index: 1,
    },
    {
      source: 'switch (1) { case 1: let w } w',
      title: 'a switch declaration outside',
      expected: null,
      name: 'w',
      index: 1,
    },
    {
      title: 'a switch discriminant beside a case declaration',
      source: 'let m = 0; switch (m) { default: let m = 1 }',
      expected: 0,
      name: 'm',
      index: 1,
    },
    {
      source: 'class C { static { var s } } s',
      title: 'a static block var outside',
      expected: null,
      name: 's',
      index: 1,
    },
    {
      source: 'namespace N { var n } n',
      title: 'a namespace var outside',
      expected: null,
      name: 'n',
      index: 1,
    },
    {
      title: 'a shorthand property key',
      source: 'let k = 1; ({ k })',
      expected: null,
      name: 'k',
      index: 1,
    },
    {
      title: 'a shorthand property value',
      source: 'let k = 1; ({ k })',
      expected: 0,
      name: 'k',
      index: 2,
    },
    {
      source: 'let k = 1; ({ [k]: 1 })',
      title: 'a computed key',
      expected: 0,
      name: 'k',
      index: 1,
    },
    {
      source: 'let k = 1; ({ k: 1 })',
      title: 'a non-computed key',
      expected: null,
      name: 'k',
      index: 1,
    },
    {
      title: 'a shorthand key in a pattern',
      source: 'let { k } = o; k',
      expected: null,
      name: 'k',
      index: 0,
    },
    {
      title: 'a shorthand value in a pattern',
      source: 'let { k } = o; k',
      expected: 1,
      name: 'k',
      index: 2,
    },
    {
      title: 'a member property',
      source: 'let p; o.p',
      expected: null,
      name: 'p',
      index: 1,
    },
    {
      title: 'a computed member property',
      source: 'let p; o[p]',
      expected: 0,
      name: 'p',
      index: 1,
    },
    {
      source: 'let f; class C { f = f }',
      title: 'a class field key',
      expected: null,
      name: 'f',
      index: 1,
    },
    {
      title: 'a class field initializer',
      source: 'let f; class C { f = f }',
      expected: 0,
      name: 'f',
      index: 2,
    },
    {
      source: 'let m; class C { m() {} }',
      title: 'a method key',
      expected: null,
      name: 'm',
      index: 1,
    },
    {
      source: 'let m; abstract class C { abstract m(): void }',
      title: 'an abstract method key',
      expected: null,
      name: 'm',
      index: 1,
    },
    {
      source: 'let f; abstract class C { abstract f: string }',
      title: 'an abstract field key',
      expected: null,
      name: 'f',
      index: 1,
    },
    {
      source: 'let q; class C { accessor q = 1 }',
      title: 'an accessor key',
      expected: null,
      name: 'q',
      index: 1,
    },
    {
      source: 'let l; l: for (;;) { break l }',
      title: 'a label',
      expected: null,
      name: 'l',
      index: 1,
    },
    {
      source: 'let meta; import.meta',
      title: 'a meta property',
      expected: null,
      name: 'meta',
      index: 1,
    },
    {
      source: 'declare const d: string; d',
      title: 'a declare const',
      expected: 0,
      name: 'd',
      index: 1,
    },
    {
      source: 'enum E { A } E.A',
      title: 'an enum',
      expected: 0,
      name: 'E',
      index: 1,
    },
    {
      source: 'let A; enum E { A }',
      title: 'an enum member name',
      expected: null,
      name: 'A',
      index: 1,
    },
    {
      source: 'let B = 1; enum E { A = B }',
      title: 'an enum member initializer',
      expected: 0,
      name: 'B',
      index: 1,
    },
    {
      source: 'namespace N {} N',
      title: 'a namespace',
      expected: 0,
      name: 'N',
      index: 1,
    },
    {
      source: 'declare namespace D {} D',
      title: 'a declared namespace',
      expected: null,
      name: 'D',
      index: 1,
    },
    {
      title: 'a qualified namespace',
      source: 'namespace A.B {} A',
      expected: null,
      name: 'A',
      index: 1,
    },
    {
      source: "import x from 'm'; x",
      title: 'a default import',
      expected: 0,
      name: 'x',
      index: 1,
    },
    {
      source: "import { y as z } from 'm'; z",
      title: 'a renamed import',
      expected: 0,
      name: 'z',
      index: 1,
    },
    {
      source: "let y; import { y as z } from 'm'",
      title: 'an imported name',
      expected: null,
      name: 'y',
      index: 1,
    },
    {
      source: "import * as ns from 'm'; ns",
      title: 'a namespace import',
      expected: 0,
      name: 'ns',
      index: 1,
    },
    {
      source: "import { type T } from 'm'; T",
      title: 'a type-only specifier',
      expected: null,
      name: 'T',
      index: 2,
    },
    {
      source: "import type W from 'm'; W",
      title: 'a type-only import',
      expected: null,
      name: 'W',
      index: 1,
    },
    {
      source: "import q = require('q'); q",
      title: 'an import equals',
      expected: 0,
      name: 'q',
      index: 1,
    },
    {
      source: "import type q = require('q'); q",
      title: 'a type import equals',
      expected: null,
      name: 'q',
      index: 1,
    },
    {
      title: 'an import equals reference',
      source: 'let N; import q = N.M',
      expected: null,
      name: 'N',
      index: 1,
    },
    {
      title: 'an export specifier local',
      source: 'let a; export { a as b }',
      expected: 0,
      name: 'a',
      index: 1,
    },
    {
      source: 'let b; export { a as b }',
      title: 'an export specifier name',
      expected: null,
      name: 'b',
      index: 1,
    },
    {
      source: "let a; export { a } from 'm'",
      title: 'a re-exported name',
      expected: null,
      name: 'a',
      index: 1,
    },
    {
      source: "let ns; export * as ns from 'm'",
      title: 'a namespace re-export',
      expected: null,
      name: 'ns',
      index: 1,
    },
    {
      source: 'let a; export default a',
      title: 'a default export',
      expected: 0,
      name: 'a',
      index: 1,
    },
    {
      source: 'let T = 1; let v: T = T',
      title: 'a type annotation',
      expected: null,
      name: 'T',
      index: 1,
    },
    {
      title: 'an initializer after a type',
      source: 'let T = 1; let v: T = T',
      expected: 0,
      name: 'T',
      index: 2,
    },
    {
      source: 'let T; type A = T',
      title: 'a type alias',
      expected: null,
      name: 'T',
      index: 1,
    },
    {
      source: 'let T; interface I extends T {}',
      title: 'an interface',
      expected: null,
      name: 'T',
      index: 1,
    },
    {
      source: 'let key; class C { [key: string]: number }',
      title: 'an index signature',
      expected: null,
      name: 'key',
      index: 1,
    },
    {
      source: 'let x = 1; type X = typeof x',
      title: 'a type query',
      expected: 0,
      name: 'x',
      index: 1,
    },
    {
      source: 'let x = 1; type X = typeof x.y',
      title: 'a qualified type query',
      expected: null,
      name: 'x',
      index: 1,
    },
    { title: 'a global', expected: null, source: 'g', name: 'g', index: 0 },
  ])('resolves $title', ({ expected, source, index, name }) => {
    expect(resolve(source, name, index)).toBe(expected)
  })

  it('resolves the imports of a JavaScript file, which have no import kind', () => {
    let { scopes, find } = createTestFile(
      "import x, { y as z } from 'm'\nx + z",
      'example.js',
    )

    expect(scopes.bindings.get(find('Identifier', 'x', 1))?.kind).toBe('import')
    expect(scopes.bindings.get(find('Identifier', 'z', 1))?.kind).toBe('import')
  })

  it.each([
    { scope: 'Program', source: 'var x', kind: 'var', name: 'x' },
    {
      source: 'function f() { { var x } }',
      scope: 'FunctionDeclaration',
      kind: 'var',
      name: 'x',
    },
    {
      source: 'class C { static { var x } }',
      scope: 'StaticBlock',
      kind: 'var',
      name: 'x',
    },
    {
      source: 'namespace N { var x }',
      scope: 'TSModuleBlock',
      kind: 'var',
      name: 'x',
    },
    { scope: 'BlockStatement', source: '{ let x }', kind: 'let', name: 'x' },
    {
      source: 'for (const x of y);',
      scope: 'ForOfStatement',
      kind: 'const',
      name: 'x',
    },
    {
      source: 'for (let x in y);',
      scope: 'ForInStatement',
      kind: 'let',
      name: 'x',
    },
    {
      source: 'switch (1) { case 1: const x = 1 }',
      scope: 'SwitchStatement',
      kind: 'const',
      name: 'x',
    },
    {
      source: '{ using x = y }',
      scope: 'BlockStatement',
      kind: 'using',
      name: 'x',
    },
    {
      source: 'async function f() { await using x = y }',
      scope: 'FunctionDeclaration',
      kind: 'using',
      name: 'x',
    },
    {
      source: 'declare const x: string',
      scope: 'Program',
      kind: 'const',
      name: 'x',
    },
    {
      source: '{ function x() {} }',
      scope: 'BlockStatement',
      kind: 'function',
      name: 'x',
    },
    {
      source: 'declare function x(): void',
      kind: 'function',
      scope: 'Program',
      name: 'x',
    },
    {
      source: 'let f = function x() {}',
      scope: 'FunctionExpression',
      kind: 'function',
      name: 'x',
    },
    {
      source: '{ class x {} }',
      scope: 'BlockStatement',
      kind: 'class',
      name: 'x',
    },
    {
      source: 'let c = class x {}',
      scope: 'ClassExpression',
      kind: 'class',
      name: 'x',
    },
    {
      scope: 'FunctionDeclaration',
      source: 'function f(x) {}',
      kind: 'parameter',
      name: 'x',
    },
    {
      scope: 'ArrowFunctionExpression',
      source: 'let f = (x = 1) => x',
      kind: 'parameter',
      name: 'x',
    },
    {
      scope: 'ArrowFunctionExpression',
      source: 'let f = (...x) => x',
      kind: 'parameter',
      name: 'x',
    },
    {
      source: 'function f({ a: [x] }) {}',
      scope: 'FunctionDeclaration',
      kind: 'parameter',
      name: 'x',
    },
    {
      source: 'class C { constructor(private x: number) {} }',
      scope: 'FunctionExpression',
      kind: 'parameter',
      name: 'x',
    },
    {
      source: 'class C { m(x): void; m(y) {} }',
      scope: 'TSEmptyBodyFunctionExpression',
      kind: 'parameter',
      name: 'x',
    },
    {
      source: 'try {} catch (x) {}',
      scope: 'CatchClause',
      kind: 'catch',
      name: 'x',
    },
    {
      source: "import x from 'm'",
      scope: 'Program',
      kind: 'import',
      name: 'x',
    },
    { source: 'enum x {}', scope: 'Program', kind: 'enum', name: 'x' },
    {
      source: 'namespace x {}',
      kind: 'namespace',
      scope: 'Program',
      name: 'x',
    },
    { source: 'module x {}', kind: 'namespace', scope: 'Program', name: 'x' },
  ])('declares $source', ({ source, scope, name, kind }) => {
    let { binding } = getBinding(source, name)
    expect(binding.kind).toBe(kind)
    expect(binding.scope.type).toBe(scope)
  })

  it.each([
    ['let x = 1', 'VariableDeclarator x = 1'],
    ['let { a: x } = o', 'VariableDeclarator { a: x } = o'],
    ['function x() {}', 'FunctionDeclaration function x() {}'],
    ['function f(x = 1) {}', 'AssignmentPattern x = 1'],
    ['function f([x]) {}', 'ArrayPattern [x]'],
    [
      'class C { constructor(public x = 1) {} }',
      'TSParameterProperty public x = 1',
    ],
    ['try {} catch (x) {}', 'CatchClause catch (x) {}'],
    ["import { y as x } from 'm'", 'ImportSpecifier y as x'],
    ['enum x { A }', 'TSEnumDeclaration enum x { A }'],
  ])('records the declaration of %s', (source, expected) => {
    let { binding, text } = getBinding(source, 'x')
    expect(describeNodes([binding.declaration], text)).toStrictEqual([expected])
  })

  it('maps every binding identifier to its binding', () => {
    let { scopes, names } = analyze('var x; var x; function f(p, { q }) {}')
    let [first, second] = names('x')
    expect(scopes.bindings.get(second!)).toBe(scopes.bindings.get(first!))
    expect(scopes.bindings.get(names('q')[1]!)?.kind).toBe('parameter')
  })

  it('declares nothing for the this parameter', () => {
    let { scopes, find } = analyze('function f(this: Window, x) { this }')
    let identifier = find('this: Window')
    expect(scopes.bindings.has(identifier)).toBe(false)
  })

  it('resolves a type query without counting it as a reference', () => {
    let { scopes, names } = analyze('let x = 1; let y: typeof x = x')
    let [declaration, query, read] = names('x')
    let binding = scopes.bindings.get(declaration!)!
    expect(scopes.bindings.get(query!)).toBe(binding)
    expect(binding.references).toStrictEqual([read])
  })

  it('attributes parameter default reads to the bindings outside the body', () => {
    let { scopes, names } = analyze(
      'let b = 1; function f(a = b) { var b = 2; b = 3; b }',
    )
    let [outer, read, inner, written, used] = names('b')
    expect(scopes.bindings.get(outer!)!.references).toStrictEqual([read])
    let binding = scopes.bindings.get(inner!)!
    expect(binding.references).toStrictEqual([written, used])
    expect(binding.writes).toHaveLength(1)
    expect(binding.scope.type).toBe('FunctionDeclaration')
  })

  it('records references in source order without the declaration', () => {
    let { scopes, names } = analyze('let s = 1; s; s = s + 1; s++; f(s)')
    let [declaration, ...uses] = names('s')
    expect(scopes.bindings.get(declaration!)!.references).toStrictEqual(uses)
  })

  it('records whole writes in source order', () => {
    let source = [
      'let s, o',
      '[s] = load(k + 1)',
      's += 1',
      's ||= 2',
      's++',
      '--s',
      '({ a: s } = o)',
      '[, ...s] = o',
      '[s = 1] = o',
      '(s as number) = 1',
      's! = 1',
      'for (s of o);',
      'for ([s] in o);',
      '[s, s] = o',
      'o.s = 1',
      'for (let s of o) s = 1',
      'for (o.s of o);',
    ].join(';\n')
    let { scopes, names, text } = analyze(source)
    let binding = scopes.bindings.get(names('s')[0]!)!
    expect(describeNodes(binding.writes, text)).toStrictEqual([
      'AssignmentExpression [s] = load(k + 1)',
      'AssignmentExpression s += 1',
      'AssignmentExpression s ||= 2',
      'UpdateExpression s++',
      'UpdateExpression --s',
      'AssignmentExpression { a: s } = o',
      'AssignmentExpression [, ...s] = o',
      'AssignmentExpression [s = 1] = o',
      'AssignmentExpression (s as number) = 1',
      'AssignmentExpression s! = 1',
      'Identifier s',
      'ArrayPattern [s]',
      'AssignmentExpression [s, s] = o',
    ])
  })

  it('resolves type names through their scopes, the first declaration winning', () => {
    let source = [
      'type A = string',
      'interface A {}',
      'let early: H',
      'type H = number',
      'class C {}',
      'export default class {}',
      'enum E {}',
      'let K = class K {}',
      'function f() {',
      '  type A = boolean',
      '  let inner: A',
      '}',
      'namespace N {',
      '  interface I {}',
      '}',
      'let a: A',
      'let c: C',
      'let e: E',
      'let i: I',
      'let k: K',
      'let q: N.I',
      'let u: Unknown',
    ].join('\n')
    let { scopes, text } = analyze(source)
    expect(
      Array.from(scopes.typeReferences, ([name, node]) => [
        text.slice(name.start, name.end),
        text.slice(node.start, node.end),
      ]),
    ).toStrictEqual([
      ['H', 'type H = number'],
      ['A', 'type A = boolean'],
      ['A', 'type A = string'],
      ['C', 'class C {}'],
      ['E', 'enum E {}'],
    ])
  })

  it('records the owners of type parameters in source order', () => {
    let source = [
      'function f<T>() {',
      '  function g<T, U>() {}',
      '}',
      'class C<T> {',
      '  m<U>() {}',
      '}',
      'interface I<T> {}',
      'type A<T> = T',
    ].join('\n')
    let { scopes, text } = analyze(source)
    expect(describeOwners(scopes, 'T', text)).toStrictEqual([
      'FunctionDeclaration function f<T>() {',
      'FunctionDeclaration function g<T, U>() {}',
      'ClassDeclaration class C<T> {',
      'TSInterfaceDeclaration interface I<T> {}',
      'TSTypeAliasDeclaration type A<T> = T',
    ])
    expect(describeOwners(scopes, 'U', text)).toStrictEqual([
      'FunctionDeclaration function g<T, U>() {}',
      'FunctionExpression <U>() {}',
    ])
  })
})
