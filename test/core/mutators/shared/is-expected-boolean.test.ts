import { describe, expect, it } from 'vitest'

import { isExpectedBoolean } from '../../../../core/mutators/shared/is-expected-boolean'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isExpectedBoolean', () => {
  it.each([
    'function f(): boolean { return a }',
    'function f(): boolean { return (a as any) }',
    'function f(x: unknown): x is string { return a }',
    'async function f(): Promise<boolean> { return a }',
    'let f = (): boolean => a',
    'let flag: boolean = a',
    'class A { flag: boolean = a }',
    'function f(flag: boolean = a) {}',
  ])('accepts a in %s', source => {
    let { context, find } = createTestContext(source)

    expect(isExpectedBoolean(find('Identifier', 'a'), context)).toBe(true)
  })

  it.each([
    'function f() { return a }',
    'function f(): string { return a }',
    'function f(x: unknown): asserts x { return a }',
    'function f(): Promise<boolean> { return a }',
    'async function f(): Promise<string> { return a }',
    'async function f(): Promise { return a }',
    'async function f(): Set<boolean> { return a }',
    'async function f(): globalThis.Promise<boolean> { return a }',
    'let f = (): boolean => { a }',
    'let flag = a',
    'let flag: string = a',
    'class A { flag = a }',
    'function f(flag = a) {}',
    'let { flag }: { flag: boolean } = a',
    'x = a',
  ])('rejects a in %s', source => {
    let { context, find } = createTestContext(source)

    expect(isExpectedBoolean(find('Identifier', 'a'), context)).toBe(false)
  })

  it('rejects a returned value outside functions', () => {
    let { context, find } = createTestContext('return a', {
      file: 'example.cjs',
    })

    expect(isExpectedBoolean(find('Identifier', 'a'), context)).toBe(false)
  })

  it('rejects the binding of an annotated declarator', () => {
    let { context, find } = createTestContext('let a: boolean = b')

    expect(isExpectedBoolean(find('Identifier', 'b'), context)).toBe(true)
    expect(isExpectedBoolean(find('Identifier', 'a: boolean'), context)).toBe(
      false,
    )
  })
})
