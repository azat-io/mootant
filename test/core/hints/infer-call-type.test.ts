import type { CallExpression } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { createInferenceSnippet } from '../../helpers/create-inference-snippet'
import { inferCallType } from '../../../core/hints/infer-call-type'

/**
 * Infers the kinds of a call of a snippet.
 *
 * @param source - Text of the snippet.
 * @param text - Text of the call expression.
 * @returns The inferred kinds, or null when unknown.
 */
function inferKinds(source: string, text: string): readonly string[] | null {
  let { inference, find } = createInferenceSnippet(source)
  let node = find(text, 'CallExpression') as CallExpression
  return inferCallType(node, inference).kinds
}

describe('inferCallType', () => {
  it.each([
    ['String(x)', ['string']],
    ['encodeURI(x)', ['string']],
    ['encodeURIComponent(x)', ['string']],
    ['decodeURI(x)', ['string']],
    ['decodeURIComponent(x)', ['string']],
    ['Number(x)', ['number']],
    ['parseInt(x)', ['number']],
    ['parseFloat(x)', ['number']],
    ['Date.now()', ['number']],
    ['performance.now()', ['number']],
    ['Math.max(1, 2)', ['number']],
    ['Math.random()', ['number']],
    ["Math['abs'](x)", ['number']],
    ['(Math?.max)(1)', ['number']],
    ['Math.max.apply(null, x)', null],
    ['Boolean(x)', ['boolean']],
    ['isNaN(x)', ['boolean']],
    ['isFinite(x)', ['boolean']],
    ['Array.isArray(x)', ['boolean']],
    ['Number.isInteger(x)', ['boolean']],
    ['Number.isFinite(x)', ['boolean']],
    ['Number.isNaN(x)', ['boolean']],
    ['Number.isSafeInteger(x)', ['boolean']],
    ['Object.is(x, y)', ['boolean']],
    ['Object.hasOwn(x, y)', ['boolean']],
    ['BigInt(x)', ['bigint']],
    ['Symbol(x)', ['symbol']],
    ['Array(3)', ['array']],
    ['Array.of(x)', ['array']],
    ['Array.from(x)', ['array']],
    ['Object.keys(x)', ['array']],
    ['Object.values(x)', ['array']],
    ['Object.entries(x)', ['array']],
    ['Object.getOwnPropertyNames(x)', ['array']],
    ['JSON.stringify(x)', ['string', 'undefined']],
    ['Promise.resolve(x)', ['promise']],
    ['Promise.reject(x)', ['promise']],
    ['Promise.all(x)', ['promise']],
    ['Promise.allSettled(x)', ['promise']],
    ['Promise.race(x)', ['promise']],
    ['Promise.any(x)', ['promise']],
    ['fetch(x)', ['promise']],
    ['Object.create(x)', ['object']],
    ['Object.fromEntries(x)', ['object']],
  ])('infers the well-known call %s', (source, expected) => {
    expect(inferKinds(source, source)).toStrictEqual(expected)
  })

  it.each([
    ['let String = (x: unknown) => 1; String(x)', 'String(x)', null],
    ['function Math() {} Math.max(1)', 'Math.max(1)', null],
    [
      'let Object = { assign: () => 1 }; Object.assign([], x)',
      'Object.assign([], x)',
      null,
    ],
    [
      'let JSON = { stringify() {} }; JSON.stringify(x)',
      'JSON.stringify(x)',
      null,
    ],
  ])('ignores a shadowed global in %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })

  it.each([
    ['x.toString()', ['string']],
    ['x.toFixed(2)', ['string']],
    ['x.trim()', ['string']],
    ['x.join()', ['string']],
    ['x.padStart(2)', ['string']],
    ['x.includes(1)', ['boolean']],
    ['x.startsWith(1)', ['boolean']],
    ['x.has(1)', ['boolean']],
    ['x.test(1)', ['boolean']],
    ['x.hasAttribute(1)', ['boolean']],
    ['x.indexOf(1)', ['number']],
    ['x.localeCompare(y)', ['number']],
    ['x.getTime()', ['number']],
    ["x.split(',')", ['array']],
    ['x.match(/a/u)', ['array', 'null']],
    ['x.codePointAt(i)', ['number', 'undefined']],
    ['x.charCodeAt(i)', ['number']],
    ['x.normalize()', ['string']],
    ['x.replace(a, b)', ['string']],
    ['x.then(f)', ['promise']],
    ['x.catch(f)', ['promise']],
    ['x.finally(f)', ['promise']],
    ["x['trim']()", null],
    ['x[trim]()', null],
    ['x.unknownMethod()', null],
  ])('infers the method call %s', (source, expected) => {
    expect(inferKinds(source, source)).toStrictEqual(expected)
  })

  it.each([
    ['Object.assign(() => 1, { a: 1 })', ['function']],
    ['Object.assign([], x)', ['array']],
    ['Object.assign({}, x)', ['object']],
    ["Object.assign('a', x)", ['object']],
    ["Object.assign(c ? null : 'a', x)", ['object']],
    ['Object.assign(null, x)', null],
    ['Object.assign(x, y)', null],
    ['Object.assign(...x)', null],
    ['Object.assign()', null],
    ['Object.freeze([1])', ['array']],
    ["Object.freeze('a')", ['string']],
    ['Object.seal(() => 1)', ['function']],
    ['Object.preventExtensions({})', ['object']],
    ['Object.setPrototypeOf(() => 1, x)', ['function']],
    ["Object.defineProperty([], 'a', x)", ['array']],
    ['Object.defineProperties(() => 1, x)', ['function']],
    ['Object.freeze(x)', null],
  ])('infers the call %s from its first argument', (source, expected) => {
    expect(inferKinds(source, source)).toStrictEqual(expected)
  })

  it.each([
    ['[1].map(f)', ['array']],
    ['[1].filter(f)', ['array']],
    ['[1].flat()', ['array']],
    ['[1].flatMap(f)', ['array']],
    ['[1].concat(x)', ['array']],
    ['[1].slice(1)', ['array']],
    ['[1].toSorted()', ['array']],
    ['[1].toReversed()', ['array']],
    ['[1].toSpliced(0)', ['array']],
    ['[1].with(0, 1)', ['array']],
    ['[1].reverse()', ['array']],
    ['[1].sort()', ['array']],
    ['[1].at(0)', null],
    ["'a'.slice(1)", ['string']],
    ["'a'.concat(x)", ['string']],
    ["'a'.at(0)", ['string', 'undefined']],
    ["'a'.codePointAt(0)", ['number', 'undefined']],
    ["'a'.replace(x, y)", ['string']],
    ["'a'.normalize()", ['string']],
    ["'a'.match(/a/u)", ['array', 'null']],
    ['[1].replace(x, y)', ['string']],
    ["'a'.map(f)", null],
    ['y.map(f)', null],
    ["(c ? 'a' : [1]).slice(1)", null],
    ['(1).with(0)', null],
  ])('infers the receiver-dependent call %s', (source, expected) => {
    expect(inferKinds(source, source)).toStrictEqual(expected)
  })

  it.each([
    ["function f(): string { return '' } f()", 'f()', ['string']],
    ['function f() {} f()', 'f()', null],
    ['async function f() {} f()', 'f()', ['promise']],
    ['function* f() {} f()', 'f()', ['object']],
    ['async function* f() {} f()', 'f()', ['object']],
    ['function f(): Promise<number> {} f()', 'f()', ['promise']],
    ['function f(x): x is string {} f(1)', 'f(1)', ['boolean']],
    ['function f(x): asserts x {} f(1)', 'f(1)', ['undefined']],
    ['declare function f(): boolean; f()', 'f()', ['boolean']],
    ['const f = (): number => 1; f()', 'f()', ['number']],
    ['const f = async () => 1; f()', 'f()', ['promise']],
    ['const f = (() => 1); f()', 'f()', null],
    ['const f = function (): bigint {}; f()', 'f()', ['bigint']],
    ['let f = (): number => 1; f()', 'f()', null],
    ['const v = 1; v()', 'v()', null],
    ['declare const f: () => string; f()', 'f()', null],
    ['const g = function h(): string { h() }', 'h()', ['string']],
    ["import { f } from 'm'; f()", 'f()', null],
    ['(0, f)()', '(0, f)()', null],
    ['(a?.b)()', '(a?.b)()', null],
    ['class A { m(): string {} n() { (this).m() } }', '(this).m()', ['string']],
    ['class A { m(): string {} n() { this.#m() } #m() {} }', 'this.#m()', null],
  ])('infers the same-file call in %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })

  it.each([
    [
      'function f(x: number): number; function f(x: string): string; function f(x) {} f(1)',
      ['number', 'string'],
    ],
    [
      'function f(x: string): string; function f(x: number): number; function f(x) {} f(1)',
      ['number', 'string'],
    ],
    [
      'export function f(x: number): number; export function f(x: string): string; export function f(x) {} f(1)',
      ['number', 'string'],
    ],
    [
      'export default function f(x: number): number; export default function f(x: string): string; export default function f(x) {} f(1)',
      ['number', 'string'],
    ],
    [
      'declare function f(x: number): number; declare function f(x: string): boolean; f(1)',
      ['boolean', 'number'],
    ],
    [
      'function f(x: number): number; function f(x); function f(x) {} f(1)',
      null,
    ],
    [
      'function g() { function f(x: number): number; function f(x: string): string; function f(x) {} f(1) }',
      ['number', 'string'],
    ],
    [
      'namespace N { function f(x: number): number; function f(x: string): string; function f(x) {} f(1) }',
      ['number', 'string'],
    ],
    [
      'switch (y) { case 1: function f(x: number): number; function f(x: string): string; function f(x) {} f(1) }',
      ['number', 'string'],
    ],
    ['if (y) function f(x: number): number; f(1)', ['number']],
    ['for (; f(1); ) function f(x: number): number;', ['number']],
  ])('infers a call of an overloaded function in %s', (source, expected) => {
    expect(inferKinds(source, 'f(1)')).toStrictEqual(expected)
  })

  it.each([
    ['class A { m(): string {} n() { this.m() } }', ['string']],
    ['class A { static m(): number {} static n() { this.m() } }', ['number']],
    ['class A { static m(): number {} n() { this.m() } }', null],
    ['class A { m(): number {} static n() { this.m() } }', null],
    ['class A { get m() { return f } n() { this.m() } }', null],
    ["class A { ['m'](): number {} n() { this.m() } }", null],
    ['class A { n() { this.m() } }', null],
    ['class A { m(): string {} n = () => this.m() }', ['string']],
    ['class A { m(): string {} v = this.m() }', ['string']],
    ['class A { static m(): number {} static v = this.m() }', ['number']],
    ['class A { m(): string {} accessor v = this.m() }', ['string']],
    ['class A { static m(): number {} static { this.m() } }', ['number']],
    ['class A { m(): string {} n() { function f() { this.m() } } }', null],
    ['class A { m(): string {} n() { return { k() { this.m() } } } }', null],
    ['function f() { this.m() }', null],
    ['this.m()', null],
    ['class A { m(): string {} [this.m()]() {} }', null],
    ['class A { m(): string {} [this.m()] = 1 }', null],
    ['class A { m(): string {} n() { this.m() } }', ['string']],
    ['class A { m(): number; m(x?): number {} n() { this.m() } }', ['number']],
    [
      'class A { m(x: number): number; m(x: string): string; m(x) {} n() { this.m() } }',
      ['number', 'string'],
    ],
    [
      'class A { m(x: string): string; m(x: number): number; m(x) {} n() { this.m() } }',
      ['number', 'string'],
    ],
    ['class A { m(): number; m(x); m(x?) {} n() { this.m() } }', null],
  ])('infers the method call of this in %s', (source, expected) => {
    expect(inferKinds(source, 'this.m()')).toStrictEqual(expected)
  })
})
