import { describe, expect, it } from 'vitest'

import { createInferenceSnippet } from '../../helpers/create-inference-snippet'
import { inferOperatorType } from '../../../core/hints/infer-operator-type'

/**
 * Infers the kinds of an operator expression of a snippet.
 *
 * @param source - Text of the snippet.
 * @param text - Text of the operator expression.
 * @returns The inferred kinds, or null when unknown.
 */
function inferKinds(source: string, text: string): readonly string[] | null {
  let { inference, find } = createInferenceSnippet(source)
  let node = find(text) as Parameters<typeof inferOperatorType>[0]
  return inferOperatorType(node, inference).kinds
}

describe('inferOperatorType', () => {
  it.each([
    ['!x', '!x', ['boolean']],
    ['delete o.p', 'delete o.p', ['boolean']],
    ['typeof x', 'typeof x', ['string']],
    ['void 0', 'void 0', ['undefined']],
    ["+'1'", "+'1'", ['number']],
    ['-x', '-x', ['number']],
    ['-1n', '-1n', ['bigint']],
    ['~1', '~1', ['number']],
    ['declare let b: bigint | string; -b', '-b', ['bigint', 'number']],
    ['declare let o: object; -o', '-o', ['bigint', 'number']],
    ['declare let s: symbol; -s', '-s', ['number']],
    ['x++', 'x++', ['number']],
    ['let i = 0n; i++', 'i++', ['bigint']],
    ['let i = 0n; --i', '--i', ['bigint']],
  ])('infers the unary %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })

  it.each([
    ['a == b', 'a == b'],
    ['a != b', 'a != b'],
    ['a === b', 'a === b'],
    ['a !== b', 'a !== b'],
    ['a < b', 'a < b'],
    ['a <= b', 'a <= b'],
    ['a > b', 'a > b'],
    ['a >= b', 'a >= b'],
    ['a in b', 'a in b'],
    ['a instanceof b', 'a instanceof b'],
    ['class A { #p; m(o) { #p in o } }', '#p in o'],
  ])('infers the comparison in %s as a boolean', (source, text) => {
    expect(inferKinds(source, text)).toStrictEqual(['boolean'])
  })

  it.each([
    ["'a' + y", ['string']],
    ["y + 'a'", ['string']],
    ['y + 1', null],
    ['1 + y', null],
    ['1 + 1', ['number']],
    ['1n + 1n', ['bigint']],
    ['true + 1', ['number']],
    ['null + undefined', ['number']],
    ['[] + 1', ['string']],
    ["1n + 'a'", ['string']],
  ])('infers the sum %s', (source, expected) => {
    expect(inferKinds(source, source)).toStrictEqual(expected)
  })

  it.each([
    ['declare let o: object; o + 1', 'o + 1', ['number', 'string']],
    ['declare let a: string | number; a + 1', 'a + 1', ['number', 'string']],
    ['declare let s: symbol; s + s', 's + s', null],
    ['declare let b: bigint | number; b + b', 'b + b', ['bigint', 'number']],
  ])('infers the sum in %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })

  it.each([
    ['y - 1', ['number']],
    ['1 - y', ['number']],
    ['1n - 1n', ['bigint']],
    ['2 * 3', ['number']],
    ['2 / 3', ['number']],
    ['2 % 3', ['number']],
    ['2 ** 3', ['number']],
    ['2 << 3', ['number']],
    ['2 >> 3', ['number']],
    ['2 & 3', ['number']],
    ['2 | 3', ['number']],
    ['2 ^ 3', ['number']],
    ["1n * 'a'", null],
    ['1n >>> 1n', ['number']],
  ])('infers the numeric operation %s', (source, expected) => {
    expect(inferKinds(source, source)).toStrictEqual(expected)
  })

  it.each([
    ['declare let o: object; o * 1', 'o * 1', ['number']],
    ['declare let o: object; o * o', 'o * o', ['bigint', 'number']],
  ])('infers the numeric operation in %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })

  it.each([
    [
      'declare let s: string | null; s && 1',
      's && 1',
      ['null', 'number', 'string'],
    ],
    ['[] && 1', '[] && 1', ['number']],
    ['y && 1', 'y && 1', null],
    ['1 && y', '1 && y', null],
    ['declare let s: string | null; s || 1', 's || 1', ['number', 'string']],
    ["null ?? 'a'", "null ?? 'a'", ['string']],
    [
      'declare let s: string | undefined; s ?? 1',
      's ?? 1',
      ['number', 'string'],
    ],
  ])('infers the logical expression in %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })

  it.each([
    ['let x; x = 1', 'x = 1', ['number']],
    ["let n = 1; n += 'a'", "n += 'a'", ['string']],
    ['let n = 1; n -= 1', 'n -= 1', ['number']],
    ['let n = 1n; n **= 2n', 'n **= 2n', ['bigint']],
    ["let s = 'a'; s += 1", 's += 1', ['string']],
    ['y += 1', 'y += 1', null],
    ['y -= 1', 'y -= 1', ['number']],
    [
      "let n: number | null = 1; n ??= 'a'",
      "n ??= 'a'",
      ['null', 'number', 'string'],
    ],
    ['let n = 1; n ||= true', 'n ||= true', ['boolean', 'number']],
    ['let n = 1; n &&= true', 'n &&= true', ['boolean', 'number']],
    ['y ||= 1', 'y ||= 1', null],
  ])('infers the assignment in %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })
})
