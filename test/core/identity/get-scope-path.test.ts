import { describe, expect, it } from 'vitest'

import { getScopePath } from '../../../core/identity/get-scope-path'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Lists the scope path of every `+` expression of a snippet.
 *
 * @param source - Text of the snippet.
 * @returns Scope paths in dispatch order.
 */
function listScopes(source: string): (string | null)[] {
  let { tree } = createTestFile(source)
  return tree.order
    .filter(node => node.type === 'BinaryExpression' && node.operator === '+')
    .map(node => getScopePath(tree, node))
}

describe('getScopePath', () => {
  it.each([
    ['const RATE = 0.2 + 1', ['RATE']],
    ['export function add(a, b = 1 + 2) { return a + b }', ['add', 'add']],
    ['export default function () { return 3 + 4 }', ['default']],
    ['class Calculator { total = 5 + 6 }', ['Calculator.total']],
    ['class Calculator { static #count = 7 + 8 }', ['Calculator.#count']],
    [
      'class Calculator { get value() { return 9 + 10 } set value(v) { this.v = v + 11 } }',
      ['Calculator.get value', 'Calculator.set value'],
    ],
    [
      'class Calculator { [Symbol.iterator]() { return 12 + 13 } }',
      ['Calculator'],
    ],
    [
      'class Calculator { run(items) { return items.map(item => item + 14) } }',
      ['Calculator.run'],
    ],
    ['class Calculator { handler = () => 15 + 16 }', ['Calculator.handler']],
    [
      "const config = { nested: { delay: 17 + 18 }, 'quoted-key': 19 + 20, [dynamic]: 21 + 22 }",
      ['config', 'config', 'config'],
    ],
    [
      'const config = { compute() { return 23 + 24 }, get size() { return 25 + 26 } }',
      ['config.compute', 'config.get size'],
    ],
    ['const handler = function named() { return 27 + 28 }', ['handler.named']],
    ['const arrow = async () => 29 + 30', ['arrow']],
    [
      'Foo.prototype.bar = function () { return 31 + 32 }',
      ['Foo.prototype.bar'],
    ],
    ['module.exports.baz = () => 33 + 34', ['module.exports.baz']],
    ['const { a = 35 + 36 } = options', [null]],
    ['let x = cond ? 37 + 38 : (() => 39 + 40)()', ['x', 'x']],
    [
      'function outer() { const local = 41 + 42; const inner = () => 43 + 44; let data = { key: 45 + 46 } }',
      ['outer', 'outer.inner', 'outer'],
    ],
    ['if (ready) { const blockLevel = 47 + 48 }', [null]],
    ['items.forEach(function named2() { use(49 + 50) })', ['named2']],
    ['export const exported = 51 + 52', ['exported']],
    ['export default { option: 53 + 54 }', ['default']],
    [
      'namespace Space.Inner { export const deep = 55 + 56; function f() { return 57 + 58 } }',
      ['Space.Inner.deep', 'Space.Inner.f'],
    ],
    ['class A { constructor(private x = 59 + 60) {} }', ['A.constructor']],
  ])('names the scopes of %s', (source, scopes) => {
    expect(listScopes(source)).toStrictEqual(scopes)
  })

  it.each(['\n', '\r\n'])(
    'names the scope inside a multi-line computed key with the line break %j',
    lineBreak => {
      let source = ['const o = {', '  [a', '  + b]: { x: 1 + 2 },', '}'].join(
        lineBreak,
      )

      expect(listScopes(source)).toStrictEqual(['o', 'o'])
    },
  )

  it.each([
    ['export default class { m() { return 1 + 2 } }', ['default.m']],
    ['export default () => 1 + 2', ['default']],
    ['export default function named() { return 1 + 2 }', ['named']],
    ['const Foo = class Bar { m() { return 1 + 2 } }', ['Foo.Bar.m']],
    ['const Foo = class { x = 1 + 2 }', ['Foo.x']],
    ['class A { accessor size = 1 + 2; [key] = 3 + 4 }', ['A.size', 'A']],
    ['class A { #run() { return 1 + 2 } }', ['A.#run']],
    [
      'const o = { 1: () => 1 + 2, 10n: () => 3 + 4, 0x1fn: () => 5 + 6 }',
      ['o.1', 'o.10', 'o.31'],
    ],
    [
      'const o = { handler: (() => 1 + 2) as Handler, value: (3 + 4) as number }',
      ['o.handler', 'o'],
    ],
    ['const f = (() => 1 + 2) satisfies Fn', ['f']],
    ['(a.b).c = function () { return 1 + 2 }', ['a.b.c']],
    ['this.handler = () => 1 + 2', ['this.handler']],
    [
      'obj[key] = () => 1 + 2; get().c = () => 3 + 4; a[0].b = () => 5 + 6',
      [null, null, null],
    ],
    ['class A { #h; m() { this.#h = () => 1 + 2 } }', ['A.m']],
    ['x = 1 + 2', [null]],
    ['namespace A { namespace B { const x = 1 + 2 } }', ['A.B.x']],
    ['for (let i = 1 + 2; ; ) {}', [null]],
    ['function f() { let value = 1 + 2 }', ['f']],
  ])('names the scopes of %s', (source, scopes) => {
    expect(listScopes(source)).toStrictEqual(scopes)
  })

  it.each([
    ['let x', 'x'],
    ['function f() { let x }', 'f'],
  ])('names the scope of the variable in %s', (source, scope) => {
    let { tree } = createTestFile(source)
    let identifier = tree.order.find(
      node => node.type === 'Identifier' && node.name === 'x',
    )!

    expect(getScopePath(tree, identifier)).toBe(scope)
  })

  it('returns null for the program', () => {
    let { tree } = createTestFile('let x = 1')
    let [program] = tree.order

    expect(getScopePath(tree, program!)).toBeNull()
  })
})
