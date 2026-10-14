import { describe, expect, it } from 'vitest'

import { createInferenceSnippet } from '../../helpers/create-inference-snippet'
import { inferExpressionType } from '../../../core/hints/infer-expression-type'

/**
 * Infers the kinds of an expression of a snippet.
 *
 * @param source - Text of the snippet.
 * @param text - Text of the expression.
 * @param file - Name of the file, which selects the language.
 * @returns The inferred kinds, or null when unknown.
 */
function inferKinds(
  source: string,
  text: string,
  file?: string,
): readonly string[] | null {
  let { inference, find } = createInferenceSnippet(source, file)
  return inferExpressionType(find(text), inference).kinds
}

describe('inferExpressionType', () => {
  it.each([
    ["'a'", "'a'", ['string']],
    [`\`a\${b}\``, `\`a\${b}\``, ['string']],
    ['1', '1', ['number']],
    ['1n', '1n', ['bigint']],
    ['true', 'true', ['boolean']],
    ['null', 'null', ['null']],
    ['/a/u', '/a/u', ['object']],
    ['String.raw`a`', 'String.raw`a`', ['string']],
    ['tag`a`', 'tag`a`', null],
    ['f()`a`', 'f()`a`', null],
    ['[1]', '[1]', ['array']],
    ['({})', '{}', ['object']],
    ['import.meta', 'import.meta', ['object']],
    ['function f() { new.target }', 'new.target', null],
    ['(function () {})', 'function () {}', ['function']],
    ['(() => 1)', '() => 1', ['function']],
    ['(class {})', 'class {}', ['function']],
    ['new Array()', 'new Array()', ['array']],
    ['new Promise(f)', 'new Promise(f)', ['promise']],
    ['new Function()', 'new Function()', ['function']],
    ['new Map()', 'new Map()', ['object']],
    ['new (getClass())()', 'new (getClass())()', ['object']],
    ["import('m')", "import('m')", ['promise']],
    ['(1)', '(1)', ['number']],
    [
      'let g = ((x: number) => x)<string>',
      '((x: number) => x)<string>',
      ['function'],
    ],
    ['declare let x: string | null; x!', 'x!', ['string']],
    ['declare let x: null; x!', 'x!', null],
    ['y!', 'y!', null],
    ['y as string', 'y as string', ['string']],
    ['1 as any', '1 as any', ['number']],
    ['[1] as const', '[1] as const', ['array']],
    ['y as Foo<string>', 'y as Foo<string>', null],
    ['<string>y', '<string>y', ['string']],
    ['1 satisfies string', '1 satisfies string', ['number']],
    ['y satisfies string', 'y satisfies string', ['string']],
    ["(1, 'a')", "1, 'a'", ['string']],
    ["c ? 1 : 'a'", "c ? 1 : 'a'", ['number', 'string']],
    ['c ? 1 : y', 'c ? 1 : y', null],
    ['a?.length', 'a?.length', ['number', 'undefined']],
    ['a?.b', 'a?.b', null],
    ['async function f() { await 1 }', 'await 1', ['number']],
    ['async function f() { await import("m") }', 'await import("m")', null],
    ['async function f() { await y }', 'await y', null],
    ['async function f() { await [1] }', 'await [1]', ['array']],
    [
      'async function f() { await (c ? 1 : null) }',
      'await (c ? 1 : null)',
      ['null', 'number'],
    ],
    ['async function f() { await new T() }', 'await new T()', null],
    ['async function f() { await (() => 1) }', 'await (() => 1)', null],
    [
      "async function f() { await (c ? 'a' : {}) }",
      "await (c ? 'a' : {})",
      null,
    ],
    ['let x = 1; x + 1', 'x', ['number']],
    ['undefined', 'undefined', ['undefined']],
    ['NaN', 'NaN', ['number']],
    ['Infinity', 'Infinity', ['number']],
    ['globalThis', 'globalThis', ['object']],
    ['window', 'window', null],
    ['let undefined = 1; undefined', 'undefined', ['number']],
    ['this', 'this', ['object']],
    ['class A { static m() { this } }', 'this', ['function']],
    ['function* g() { yield 1 }', 'yield 1', null],
    ['class A extends B { m() { super.m() } }', 'super', null],
    ['1 + 1', '1 + 1', ['number']],
    ['let x; x = 1', 'x = 1', ['number']],
    ["1 && 'a'", "1 && 'a'", ['number', 'string']],
    ['x++', 'x++', ['number']],
    ['-x', '-x', ['number']],
    ['a.length', 'a.length', ['number']],
    ['String(a)', 'String(a)', ['string']],
    ['debugger', 'debugger', null],
  ])('infers %s at %s', (source, text, expected) => {
    expect(inferKinds(source, text)).toStrictEqual(expected)
  })

  it.each([
    ['<div />', '<div />'],
    ['<></>', '<></>'],
  ])('infers the JSX %s as an object', (source, text) => {
    expect(inferKinds(source, text, 'example.tsx')).toStrictEqual(['object'])
  })
})
