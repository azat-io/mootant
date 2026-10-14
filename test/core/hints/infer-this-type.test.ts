import type { ThisExpression } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { createInferenceSnippet } from '../../helpers/create-inference-snippet'
import { inferThisType } from '../../../core/hints/infer-this-type'

/**
 * Infers the kinds of the first `this` of a snippet.
 *
 * @param source - Text of the snippet.
 * @param file - Name of the file, which selects the language and the source
 *   type.
 * @returns The inferred kinds, or null when unknown.
 */
function inferKinds(source: string, file?: string): readonly string[] | null {
  let { inference, find } = createInferenceSnippet(source, file)
  let node = find('this', 'ThisExpression') as ThisExpression
  return inferThisType(node, inference).kinds
}

describe('inferThisType', () => {
  it.each([
    ['class A { static m() { this } }', ['function']],
    ['class A { static get m() { return this } }', ['function']],
    ['class A { static { this } }', ['function']],
    ['class A { static x = this }', ['function']],
    ['class A { static x = () => this }', ['function']],
    ['class A { static accessor x = this }', ['function']],
    ['class A { m() { this } }', ['object']],
    ['class A { constructor() { this } }', ['object']],
    ['class A { get m() { return this } }', ['object']],
    ['class A { set m(v) { this } }', ['object']],
    ['class A { x = this }', ['object']],
    ['class A { accessor x = this }', ['object']],
    ['class A { m() { return () => () => this } }', ['object']],
    ['class A { m(x = this) {} }', ['object']],
    ['class A { static m() { return class { n() { this } } } }', ['object']],
    ['x = { m() { this } }', ['object']],
    ['x = { get m() { return this } }', ['object']],
    ['x = { set m(v) { this } }', ['object']],
    ['x = { m: function () { this } }', null],
    ['function f() { this }', null],
    ['x = function () { this }', null],
    ['class A { m() { function f() { this } } }', null],
    ['class A { static m() { x = function () { this } } }', null],
    ['this', ['object']],
    ['x = () => this', ['object']],
    ['class A { [this.k] = 1 }', ['object']],
    ['class A { static [this.k]() {} }', ['object']],
  ])('infers this in the script %s', (source, expected) => {
    expect(inferKinds(source)).toStrictEqual(expected)
  })

  it.each([
    ['this; export {}', 'example.ts', ['undefined']],
    ['x = () => this; export {}', 'example.ts', ['undefined']],
    ["import 'm'; class A { [this.k] = 1 }", 'example.js', ['undefined']],
    ['this', 'example.mjs', ['undefined']],
    ['this', 'example.mts', ['undefined']],
    ['this', 'example.cjs', ['object']],
    ['this', 'example.cts', ['object']],
    ['class A { static m() { this } }', 'example.mjs', ['function']],
  ])('infers this in %s of %s', (source, file, expected) => {
    expect(inferKinds(source, file)).toStrictEqual(expected)
  })
})
