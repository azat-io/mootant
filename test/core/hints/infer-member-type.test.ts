import type { MemberExpression } from 'oxc-parser'

import { describe, expect, it, vi } from 'vitest'

import { createInferenceSnippet } from '../../helpers/create-inference-snippet'
import { inferMemberType } from '../../../core/hints/infer-member-type'
import { walkTree } from '../../../core/tree/walk-tree'

vi.mock(import('../../../core/tree/walk-tree'), async importOriginal => {
  let actual = await importOriginal()
  return { walkTree: vi.fn(actual.walkTree) }
})

/**
 * Infers the kinds of a member expression of a snippet.
 *
 * @param source - Text of the snippet.
 * @param text - Text of the member expression; its first occurrence is used.
 * @returns The inferred kinds, or null when unknown.
 */
function inferKinds(source: string, text: string): readonly string[] | null {
  let { inference, find } = createInferenceSnippet(source)
  let node = find(text, 'MemberExpression') as MemberExpression
  return inferMemberType(node, inference).kinds
}

/**
 * Builds a class whose first method `read` reads `this.n`, with other members
 * after it.
 *
 * @param members - Members of the class written after `read`.
 * @returns Source text of the class.
 */
function readField(members: string): string {
  return `class A { read() { return this.n }; ${members} }`
}

describe('inferMemberType', () => {
  it.each([
    ['x.length', 'x.length', ['number']],
    ["x['length']", "x['length']", ['number']],
    ['this.length', 'this.length', ['number']],
    ['x[k]', 'x[k]', null],
    ['x[0]', 'x[0]', null],
    ['x.size', 'x.size', null],
    ['this.n', 'this.n', null],
    ['function f() { this.n }', 'this.n', null],
    ['class A { n = 1; m() { return { k() { this.n } } } }', 'this.n', null],
    ['class A { n = 1; [this.n]() {} }', 'this.n', null],
    ['class A { n = 1; [this.n] = 2 }', 'this.n', null],
    ['class A { n = 1; m() { function f() { this.n } } }', 'this.n', null],
    ["class A { n = 1; m() { this['n'] } }", "this['n']", null],
    ['class A { n = 1; m() { (this).n } }', '(this).n', ['number']],
    ['class A { #n = 1; m() { this.#n } }', 'this.#n', ['number']],
  ])('infers %s at %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })

  it.each([
    ['n: number = 1', ['number']],
    ['n?: string', ['string', 'undefined']],
    ['n!: string', ['string']],
    ['declare n: boolean', ['boolean']],
    ['n = 1', ['number']],
    ['n', ['undefined']],
    ['accessor n = 1', ['number']],
    ["n = 1; m() { this.n = 'a' }", ['number', 'string']],
    ["n = 1; m() { (this.n) = 'a' }", ['number', 'string']],
    ['n = 1; m() { this.n = y }', null],
    ['n = 1; m() { this.n++ }', null],
    ['n = new Map(); m() { delete this.n }', ['object', 'undefined']],
    ['n = 1; m() { delete (this.n) }', ['number', 'undefined']],
    ['n = 1; m() { typeof this.n }', ['number']],
    ['n?: number; m() { delete this.n }', ['number', 'undefined']],
    ['n = 1; m() { this.n += 1 }', null],
    ['n = 1; m() { this.n ??= 1 }', null],
    ['n = 1; m(x) { [this.n] = x }', null],
    ['n = 1; m(x) { [...this.n] = x }', null],
    ['n = 1; m(x) { [this.n = 1] = x }', null],
    ['n = 1; m(x) { ({ a: this.n } = x) }', null],
    ['n = 1; m(x) { for (this.n of x); }', null],
    ['n = 1; m(x) { for (this.n in x); }', null],
    ['n = 1; m(x) { x = this.n }', ['number']],
    ['n = 1; m(x) { [x = this.n] = x }', ['number']],
    ['n = 1; m(x) { for (x of this.n); }', ['number']],
    ['n = 1; m(x) { ({ [this.n]: x } = x) }', ['number']],
    ['n = 1; m(x) { return { a: this.n } }', ['number']],
    ["n = 1; m() { function f() { this.n = 'a' } }", ['number']],
    ["n = 1; m() { class B { n = 1; k() { this.n = 'a' } } }", ['number']],
    ["n = 1; static m() { this.n = 'a' }", ['number']],
    ["n = 1; m = () => { this.n = 'a' }", ['number', 'string']],
    ["static n = 'a'; n = 1", ['number']],
    ['static n = 1', null],
    ["['n'] = 1", null],
    ["'n' = 1", null],
    ['m() {}', null],
    ["n = 1; m(x: string) { this.n = 'a' }", ['number', 'string']],
    ['constructor(private n: number) {}', ['number']],
    ['constructor(public n = 1) {}', ['number']],
    ['constructor(private n?: string) {}', ['string', 'undefined']],
    ['constructor(n: number) {}', null],
    ['constructor(private k: number) {}', null],
  ])('infers a field declared as %s', (members, expected) => {
    expect(inferKinds(readField(members), 'this.n')).toStrictEqual(expected)
  })

  it.each([
    [
      "class A { static n = 1; n = 'a'; static m() { return this.n } }",
      ['number'],
    ],
    ["class A { static n = 1; n = 'a'; m() { return this.n } }", ['string']],
    ['class A { static n = 1; static { this.n } }', ['number']],
    ['class A { n = 1; k = this.n }', ['number']],
    ['class A { static n = 1; static k = this.n }', ['number']],
    ['class A { n = 1; m = () => this.n }', ['number']],
    ['abstract class A { abstract n: string; m() { this.n } }', ['string']],
    [
      'class A { constructor(private n: number) {} static m() { this.n } }',
      null,
    ],
  ])('infers this.n in %s', (source, expected) => {
    expect(inferKinds(source, 'this.n')).toStrictEqual(expected)
  })

  it('walks each class once for the reads of all its fields', () => {
    let { inference, find } = createInferenceSnippet(
      [
        'class A {',
        '  n = 1',
        "  s = ''",
        '  a() { return this.n }',
        '  b() { return this.s }',
        '}',
        'class B {',
        '  k = true',
        '  c() { return this.k }',
        '}',
      ].join('\n'),
    )
    let reads = ['this.n', 'this.s', 'this.n', 'this.k'].map(
      text => find(text, 'MemberExpression') as MemberExpression,
    )
    vi.mocked(walkTree).mockClear()

    expect(
      reads.map(node => inferMemberType(node, inference).kinds),
    ).toStrictEqual([['number'], ['string'], ['number'], ['boolean']])
    expect(walkTree).toHaveBeenCalledTimes(2)
  })
})
