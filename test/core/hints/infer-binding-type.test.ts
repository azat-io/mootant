import { describe, expect, it } from 'vitest'

import type { TypeInference } from '../../../types/type-inference'
import type { Binding } from '../../../types/binding'

import { createInferenceSnippet } from '../../helpers/create-inference-snippet'
import { inferBindingType } from '../../../core/hints/infer-binding-type'

/**
 * Finds the first binding named `x`.
 *
 * @param inference - Inference context whose scope analysis is searched.
 * @returns The first binding in declaration order whose identifier is `x`.
 */
function findBinding(inference: TypeInference): Binding {
  for (let binding of inference.scopes.bindings.values()) {
    let { identifier } = binding
    if (identifier.type === 'Identifier' && identifier.name === 'x') {
      return binding
    }
  }
  throw new Error('No binding named x.')
}

/**
 * Infers the kinds of the first binding named `x` of a snippet.
 *
 * @param source - Text of the snippet.
 * @param file - Name of the file, which selects the language.
 * @returns The inferred kinds, or null when unknown.
 */
function inferKinds(
  source: string,
  file = 'example.ts',
): readonly string[] | null {
  let { inference } = createInferenceSnippet(source, file)
  return inferBindingType(findBinding(inference), inference).kinds
}

describe('inferBindingType', () => {
  it.each([
    ['function x() {}', ['function']],
    ['class x {}', ['function']],
    ['let f = function x() {}', ['function']],
    ['enum x {}', ['object']],
    ['namespace x {}', ['object']],
    ["import x from 'm'", null],
    ['try {} catch (x) {}', null],
  ])('infers the declaration %s', (source, expected) => {
    expect(inferKinds(source)).toStrictEqual(expected)
  })

  it.each([
    ['function f(x: string) {}', ['string']],
    ['function f(x?: string) {}', ['string', 'undefined']],
    ['function f(x?: any) {}', null],
    ['function f(x?) {}', null],
    ['function f(x) {}', null],
    ['function f(...x) {}', ['array']],
    ['function f(...x: Set<string>) {}', ['object']],
    ['function f(x = 1) {}', ['number']],
    ['function f(x = y) {}', null],
    ['function f(x = undefined) {}', null],
    ["function f(x: string = 'a') {}", ['string']],
    ['function f(x = c ? 1 : undefined) {}', ['number']],
    ['function f({ x }) {}', null],
    ['function f({ a: [x] }) {}', null],
    ['function f([a, ...x]) {}', ['array']],
    ['function f({ a, ...x }) {}', ['object']],
    ['function f({ a: { ...x } }) {}', ['object']],
    ['function f({ x } = {}) {}', null],
    ['function f([...x] = []) {}', ['array']],
    ['function f(...[x]) {}', null],
    ['function f(...[...x]) {}', ['array']],
    ['class A { constructor(private x: number) {} }', ['number']],
    ['class A { constructor(public x = 1) {} }', ['number']],
  ])('infers the parameter in %s', (source, expected) => {
    expect(inferKinds(source)).toStrictEqual(expected)
  })

  it.each([
    ['function f(x = 1) {}', null],
    ['function f(x = []) {}', null],
    ['function f(x = undefined) {}', null],
    ['function f(x = y) {}', null],
    ['function f([...x] = []) {}', ['array']],
  ])('infers the JavaScript parameter in %s', (source, expected) => {
    expect(inferKinds(source, 'example.js')).toStrictEqual(expected)
  })

  it.each([
    ['let x: string', ['string']],
    ['let x: string | null = null', ['null', 'string']],
    ['const x: number = y', ['number']],
    ['declare const x: boolean', ['boolean']],
    ['const x = 1', ['number']],
    ['const x = null', ['null']],
    ['const x = y', null],
    ['declare const x', null],
    ['{ using x = y }', null],
    ['{ using x = (1 as never) }', ['number']],
    ['let x = 1', ['number']],
    ["var x = 'a'", ['string']],
    ['let x = { a: 1 }', ['object']],
    [
      'let x = {}',
      [
        'array',
        'bigint',
        'boolean',
        'function',
        'number',
        'object',
        'promise',
        'string',
        'symbol',
      ],
    ],
    [
      'let x = ({})',
      [
        'array',
        'bigint',
        'boolean',
        'function',
        'number',
        'object',
        'promise',
        'string',
        'symbol',
      ],
    ],
    ['let x = {} as Foo', null],
    ['let x = <Foo>{}', null],
    ['let x = 1 as number | null', ['null', 'number']],
    ["let x = ('a' as const)", ['string']],
    ['const x = {} as Foo', ['object']],
    ['let x = null', null],
    ['let x = undefined', null],
    ['let x', null],
    ['let x = y', null],
    ['declare let x', null],
    ['for (const x in o);', ['string']],
    ['for (let x in o);', ['string']],
    ['for (var x in o);', ['string']],
    ['for (const x of o);', null],
    ['for (let x = 1; ; );', ['number']],
    ['const { x } = o', null],
    ['const [a, ...x] = [1]', null],
  ])('infers the variable in %s', (source, expected) => {
    expect(inferKinds(source)).toStrictEqual(expected)
  })

  it.each([
    ['let x = 1', ['null', 'number', 'undefined']],
    ["var x = 'a'", ['null', 'string', 'undefined']],
    ['let x = {}', ['null', 'object', 'undefined']],
    ['let x = null', null],
    ['let x', null],
    ['const x = 1', ['number']],
    ["let x = 1; x = 'a'", ['null', 'number', 'string', 'undefined']],
    ['let x = 1; x = load()', null],
    ["let x = 1; x ||= 'a'", ['null', 'number', 'string', 'undefined']],
    ["let x = 1; x &&= 'a'", ['null', 'number', 'string', 'undefined']],
    ['let x = 1; x ??= true', ['boolean', 'null', 'number', 'undefined']],
    ["let x = 'a'; x++", ['null', 'number', 'string', 'undefined']],
    ['let x = 1n; x--', ['bigint', 'null', 'number', 'undefined']],
    ["let x = 'a'; x += 1", ['null', 'number', 'string', 'undefined']],
    ['let x = 1; x += 2', ['null', 'number', 'undefined']],
    ['let x = 1; x += y', ['null', 'number', 'undefined']],
    ["let x = 1; x += 'a'", ['null', 'number', 'string', 'undefined']],
    ['let x = true; x *= 2', ['boolean', 'null', 'number', 'undefined']],
    ['let x = 1; [x] = o', null],
    ['let x = 1; for (x of o);', null],
  ])('infers the JavaScript variable in %s', (source, expected) => {
    expect(inferKinds(source, 'example.js')).toStrictEqual(expected)
  })
})
