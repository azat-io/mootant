import { describe, expect, it } from 'vitest'

import { getReturnValueKind } from '../../../../core/mutators/shared/get-return-value-kind'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getReturnValueKind', () => {
  it.each<{
    expected: string | null
    source: string
    name: string
    nth: number
  }>([
    {
      source: 'function f(u: User): string { return a }',
      expected: 'string',
      name: 'a',
      nth: 0,
    },
    {
      source: 'function f(): number { return (a as any) }',
      expected: 'number',
      name: 'a',
      nth: 0,
    },
    {
      source: "const a = 'x'; function f() { return a }",
      expected: 'string',
      name: 'a',
      nth: 1,
    },
    {
      source: 'function f(x: unknown): x is string { return a }',
      expected: 'boolean',
      name: 'a',
      nth: 0,
    },
    {
      source: 'function f(x: unknown): asserts x { return a }',
      expected: 'void',
      name: 'a',
      nth: 0,
    },
    {
      source: 'async function f(): Promise<number> { return a }',
      expected: 'number',
      name: 'a',
      nth: 0,
    },
    {
      source: 'async function f(): Promise<void> { return a }',
      expected: 'void',
      name: 'a',
      nth: 0,
    },
    {
      source: 'async function f(): Promise { return a }',
      expected: 'void',
      name: 'a',
      nth: 0,
    },
    {
      source: 'async function f(): Set<number> { return a }',
      expected: 'object',
      name: 'a',
      nth: 0,
    },
    { source: 'let f = (): void => a', expected: 'void', name: 'a', nth: 0 },
    {
      source: 'let f = (): undefined => a',
      expected: 'void',
      name: 'a',
      nth: 0,
    },
    {
      source: 'function f(): never { return a }',
      expected: 'void',
      name: 'a',
      nth: 0,
    },
    {
      source: 'function f(): string[] { return a }',
      expected: 'array',
      name: 'a',
      nth: 0,
    },
    { source: 'rows.filter(r => a)', expected: 'boolean', name: 'a', nth: 0 },
    {
      source: 'rows.filter(r => { return a })',
      expected: 'boolean',
      name: 'a',
      nth: 0,
    },
    {
      source: 'let s: string = f(); x = () => s',
      expected: 'string',
      name: 's',
      nth: 0,
    },
    {
      source: 'function f(): string { let n = 1; return n }',
      expected: 'number',
      name: 'n',
      nth: 1,
    },
    {
      source: 'function f() { return a }',
      expected: 'unknown',
      name: 'a',
      nth: 0,
    },
    { source: 'function* f() { return a }', expected: null, name: 'a', nth: 0 },
    {
      source: 'class A { constructor() { return a } }',
      expected: null,
      name: 'a',
      nth: 0,
    },
    {
      source: 'class A { set v(x) { return a } }',
      expected: null,
      name: 'a',
      nth: 0,
    },
    {
      source: 'x = { set v(x) { return a } }',
      expected: null,
      name: 'a',
      nth: 0,
    },
    {
      source: 'class A { m(): boolean { return a } }',
      expected: 'boolean',
      name: 'a',
      nth: 0,
    },
    { source: 'x = () => { a }', expected: null, name: 'a', nth: 0 },
    { source: 'x = a', expected: null, name: 'a', nth: 0 },
  ])('reads the kind in $source', ({ expected, source, name, nth }) => {
    let { context, find } = createTestContext(source)

    expect(getReturnValueKind(find('Identifier', name, nth), context)).toBe(
      expected,
    )
  })

  it.each<{ expected: object | string; source: string }>([
    {
      source: 'function f(): Promise<string> { return a }',
      expected: { promise: 'string' },
    },
    {
      source: 'function f(): Promise<void> { return a }',
      expected: { promise: 'void' },
    },
    {
      source: 'function f(): Promise { return a }',
      expected: { promise: 'void' },
    },
    {
      source: 'function f(): Promise<undefined> { return a }',
      expected: { promise: 'void' },
    },
    {
      source: 'function f(): Promise<{ id: string } | undefined> { return a }',
      expected: { promise: 'void' },
    },
    {
      source:
        'function f<T>(): Promise<T | undefined> { return a as Promise<T | undefined> }',
      expected: { promise: 'void' },
    },
    {
      source: 'function f(): Promise<string | undefined> { return a }',
      expected: { promise: 'string' },
    },
    {
      source: 'function f(): Promise<{ id: string } | null> { return a }',
      expected: { promise: 'null' },
    },
    {
      source: 'function f(): Promise<User | null> { return a }',
      expected: { promise: 'null' },
    },
    {
      source: 'function f(): Promise<(User | null)> { return a }',
      expected: { promise: 'null' },
    },
    {
      source: [
        "import type { User } from './user'",
        'type Result = User | null',
        'function f(): Promise<Result> { return a }',
      ].join('\n'),
      expected: { promise: 'null' },
    },
    {
      source:
        'type Found = User | undefined\nfunction f(): Promise<Found | null> { return a }',
      expected: { promise: 'void' },
    },
    {
      source: 'function f(): Promise<null | undefined> { return a }',
      expected: { promise: 'void' },
    },
    {
      source: 'type Done = void\nfunction f(): Promise<Done> { return a }',
      expected: { promise: 'void' },
    },
    {
      source: 'function f(): Promise<never> { return a }',
      expected: { promise: 'void' },
    },
    {
      source: 'let f = (): Promise<Set<number>> => a',
      expected: { promise: 'void' },
    },
    {
      source: 'class A { m(): Promise<boolean> { return a } }',
      expected: { promise: 'boolean' },
    },
    {
      source: 'rows.filter((r): Promise<boolean> => a)',
      expected: 'boolean',
    },
    {
      source: 'function f(a: string): Promise<number> { return a }',
      expected: { promise: 'number' },
    },
    {
      source:
        'type Promise<T> = T[]; function f(): Promise<string> { return a }',
      expected: 'array',
    },
    {
      source: [
        "import { Promise } from 'bluebird'",
        'function f(): Promise<string> { return a }',
      ].join('\n'),
      expected: 'object',
    },
    {
      source: [
        "import type { Promise } from 'bluebird'",
        'function f(): Promise<string> { return a }',
      ].join('\n'),
      expected: 'object',
    },
    {
      source: [
        'const Promise = globalThis.Promise',
        'function f(): Promise<string> { return a }',
      ].join('\n'),
      expected: 'object',
    },
    {
      source: 'async function f(): Promise<string> { return a }',
      expected: 'string',
    },
  ])('reads the promise kind in $source', ({ expected, source }) => {
    let { context, find } = createTestContext(source)

    expect(getReturnValueKind(find('Identifier', 'a'), context)).toStrictEqual(
      expected,
    )
  })
})
