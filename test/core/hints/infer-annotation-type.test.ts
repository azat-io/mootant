import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { TypeInference } from '../../../types/hints/type-inference'
import type { Binding } from '../../../types/syntax/binding'

import { createInferenceSnippet } from '../../helpers/create-inference-snippet'
import { inferAnnotationType } from '../../../core/hints/infer-annotation-type'

/**
 * Sorted kinds of a value that is anything but `null` and `undefined`.
 */
const NON_NULLISH = [
  'array',
  'bigint',
  'boolean',
  'function',
  'number',
  'object',
  'promise',
  'string',
  'symbol',
]

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
 * Infers the kinds of the annotation of the first binding named `x` in a
 * snippet.
 *
 * @param source - Text of the snippet; it annotates `x`.
 * @returns The inferred kinds, or null when unknown.
 */
function inferKinds(source: string): readonly string[] | null {
  let { inference } = createInferenceSnippet(source)
  let { identifier } = findBinding(inference)
  let wrapper = Reflect.get(identifier, 'typeAnnotation') as Node
  return inferAnnotationType(wrapper, inference).kinds
}

/**
 * Infers the kinds of a type node of a snippet.
 *
 * @param source - Text of the snippet.
 * @param text - Text of the type node.
 * @param type - Value of the `type` property of the wanted node.
 * @returns The inferred kinds, or null when unknown.
 */
function inferNodeKinds(
  source: string,
  text: string,
  type: string,
): readonly string[] | null {
  let { inference, find } = createInferenceSnippet(source)
  return inferAnnotationType(find(text, type), inference).kinds
}

describe('inferAnnotationType', () => {
  it.each([
    ['string', ['string']],
    ['number', ['number']],
    ['bigint', ['bigint']],
    ['boolean', ['boolean']],
    ['symbol', ['symbol']],
    ['undefined', ['undefined']],
    ['void', ['undefined']],
    ['null', ['null']],
    ['object', ['array', 'function', 'object', 'promise']],
    ['any', null],
    ['unknown', null],
    ['never', null],
    ["'a'", ['string']],
    ['1', ['number']],
    ['-1', ['number']],
    ['true', ['boolean']],
    ['1n', ['bigint']],
    ['-1n', ['bigint']],
    ['`a`', ['string']],
    [`\`a\${string}\``, ['string']],
    ['string[]', ['array']],
    ['[string, number]', ['array']],
    ['Array<string>', ['array']],
    ['ReadonlyArray<string>', ['array']],
    ['() => void', ['function']],
    ['new () => object', ['function']],
    ['Function', ['function']],
    ['{ a: string }', ['object']],
    ['{ [K in keyof T]: T[K] }', ['object']],
    ['Record<string, number>', ['object']],
    ['Map<string, number>', ['object']],
    ['Set<string>', ['object']],
    ['WeakMap<object, number>', ['object']],
    ['WeakSet<object>', ['object']],
    ['ReadonlyMap<string, number>', ['object']],
    ['ReadonlySet<string>', ['object']],
    ['Date', ['object']],
    ['RegExp', ['object']],
    ['Error', ['object']],
    ['Partial<T>', ['object']],
    ['Required<T>', ['object']],
    ["Pick<T, 'a'>", ['object']],
    ["Omit<T, 'a'>", ['object']],
    ['Promise<string>', ['promise']],
    ['PromiseLike<string>', ['promise']],
    ['Readonly<string[]>', ['array']],
    ['Readonly', null],
    ['readonly string[]', ['array']],
    ['(string)', ['string']],
    ['((string | null))', ['null', 'string']],
    ['NonNullable<string | null>', ['string']],
    ['NonNullable<null>', null],
    ['NonNullable<any>', null],
    ['String', ['string']],
    ['Number', ['number']],
    ['Boolean', ['boolean']],
    ['string | null', ['null', 'string']],
    ['string | any', null],
    ["string & { brand: 'id' }", ['string']],
    ["{ brand: 'id' } & 'a'", ['string']],
    [`\`a\${string}\` & { brand: 1 }`, ['string']],
    ['{ a: 1 } & { b: 2 }', ['object']],
    ['{ a: 1 } & {}', ['object']],
    ['{ a: 1 } & object', ['object']],
    ['{} & {}', null],
    ['(() => void) & { id: string }', ['function']],
    ['{ id: string } & (new () => object)', ['function']],
    ['string[] & { total: number }', ['array']],
    ['Promise<string> & { cancel(): void }', ['promise']],
    ['(() => void) & string[]', null],
    ['(() => void) & ({ a: 1 } | string[])', null],
    ['{ (e: number): void }', ['function']],
    ['{ new (): object }', ['function']],
    ['{ m(): void }', ['object']],
    ['{ a: 1 } & Foo<Bar>', null],
    ['{ a: 1 } & User', null],
    ['keyof T', ['number', 'string', 'symbol']],
    ['unique symbol', ['symbol']],
    ['User', null],
    ['Maybe<User>', null],
    ['NS.User', null],
    ['NS.Maybe<User>', null],
    ["T['a']", null],
    ['T extends string ? 1 : 2', null],
    ["import('m').T", null],
    ['typeof window', null],
    ['typeof a.b', null],
  ])('infers the annotation %s', (type, expected) => {
    expect(inferKinds(`let x: ${type}`)).toStrictEqual(expected)
  })

  it.each(['{}', 'Object', 'NonNullable<{}>'])(
    'infers the annotation %s as any non-nullish value',
    type => {
      expect(inferKinds(`let x: ${type}`)).toStrictEqual(NON_NULLISH)
    },
  )

  it.each([
    'interface User {} let x: User',
    'function f<T extends {}>(x: T) {}',
    'function f<T extends Object>(x: T) {}',
    'type Empty = {}; let x: Empty',
  ])('infers the annotation of x in %s as any non-nullish value', source => {
    expect(inferKinds(source)).toStrictEqual(NON_NULLISH)
  })

  it.each([
    ['let x: Object | null', [...NON_NULLISH, 'null']],
    [
      'function f<T extends {}>(x: T | undefined) {}',
      [...NON_NULLISH, 'undefined'],
    ],
  ])(
    'infers the annotation of x in %s with nullish kinds',
    (source, expected) => {
      expect(inferKinds(source)).toStrictEqual(expected.toSorted())
    },
  )

  it.each([
    ['let a = 1; let x: typeof a', ['number']],
    ['let x: typeof x', null],
    ['let a: typeof b; let b: typeof a; let x: typeof a', null],
    [
      'interface User { name: string } type MaybeUser = User | null; let x: MaybeUser',
      ['null', 'object'],
    ],
    ['type A = B; type B = A; let x: A', null],
    ['type L = { next: L } | null; let x: L', ['null', 'object']],
    ['type Maybe<T> = T | null; let x: Maybe<string>', null],
    ['type Maybe<T extends string> = T | null; let x: Maybe<string>', null],
    ['interface User { name: string } let x: User', ['object']],
    ['interface Admin extends User {} let x: Admin', ['object']],
    ['interface Handler { (e: number): void } let x: Handler', ['function']],
    [
      'interface Factory extends Base { new (): object } let x: Factory',
      ['function'],
    ],
    ['type Handler = { (e: number): void }; let x: Handler', ['function']],
    [
      'interface A { (e: number): void } interface B extends A { id: string } let x: B',
      ['function'],
    ],
    ['interface B extends Function { id: string } let x: B', ['function']],
    ['interface B extends Array<number> { id: string } let x: B', ['array']],
    ['interface B extends ReadonlyArray<number> {} let x: B', ['array']],
    [
      'interface A extends B { id: string } interface B extends A {} let x: A',
      ['object'],
    ],
    ['interface B extends Base { id: string } let x: B', ['object']],
    ['interface B extends ns.Base { id: string } let x: B', ['object']],
    [
      'interface A { id: string } interface B extends A {} let x: B',
      ['object'],
    ],
    ['class User {} let x: User', ['object']],
    ['enum E { A, B } let x: E', ['number']],
    ["enum E { A = 'a', B = `b` } let x: E", ['string']],
    ["enum E { A = 'a', B = 1 } let x: E", ['number', 'string']],
    ['enum E { A = 1, B = f() } let x: E', ['number']],
    ['type Promise = string; let x: Promise', ['string']],
    ['type T = string; function f<T>(x: T) {}', null],
    ['function f<T extends string>(x: T) {}', ['string']],
    ['function f<T>(x: T) {}', null],
    [
      'interface User { name: string } function f<T extends User | undefined>(x: T) {}',
      ['object', 'undefined'],
    ],
    ['function f<T extends U, U extends T>(x: T) {}', null],
    [
      'function f<T extends string>() { function g<T extends number>(x: T) {} }',
      ['number'],
    ],
    [
      'function f<T extends string>(x: T) { function g<T extends number>() {} }',
      ['string'],
    ],
    ['function g<T extends number>() {} function f(x: T) {}', null],
    [
      'type T = string; function f() { type T = string | null; let x: T }',
      ['null', 'string'],
    ],
    ['function f() { type T = string } let x: T', null],
    ['let x: T; type T = number', ['number']],
    ['class A<T extends boolean> { m(x: T) {} }', ['boolean']],
  ])('infers the annotation of x in %s', (source, expected) => {
    expect(inferKinds(source)).toStrictEqual(expected)
  })

  it.each([
    {
      source: 'function f(): string {}',
      type: 'TSTypeAnnotation',
      expected: ['string'],
      text: ': string',
    },
    {
      source: 'function f(): string {}',
      type: 'TSStringKeyword',
      expected: ['string'],
      text: 'string',
    },
    {
      source: 'function f(x): x is string {}',
      type: 'TSTypePredicate',
      expected: ['boolean'],
      text: 'x is string',
    },
    {
      source: 'function f(x): asserts x {}',
      type: 'TSTypePredicate',
      expected: ['undefined'],
      text: 'asserts x',
    },
    {
      source: 'function f(x): asserts x is string {}',
      text: 'asserts x is string',
      type: 'TSTypePredicate',
      expected: ['undefined'],
    },
    {
      source: 'let p: Promise<number>',
      type: 'TSNumberKeyword',
      expected: ['number'],
      text: 'number',
    },
    {
      source: 'class A { m(): this { return this } }',
      type: 'TSThisType',
      expected: null,
      text: 'this',
    },
    { source: 'let a = 1', type: 'Literal', expected: null, text: '1' },
    { source: 'let a = 1', type: 'Identifier', expected: null, text: 'a' },
  ])('infers $source at $text', ({ expected, source, text, type }) => {
    expect(inferNodeKinds(source, text, type)).toStrictEqual(expected)
  })
})
