import { describe, expect, it } from 'vitest'

import { isBooleanResultSource } from '../../../../core/mutators/shared/is-boolean-result-source'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isBooleanResultSource', () => {
  it.each<[string, boolean]>([
    ['function f(s: string): boolean { const found = a; return found }', true],
    [
      'function f(s: string): boolean { let found = false; found = a; return (found) }',
      true,
    ],
    ['function f(s: string) { let found; found = a; return found < 1 }', false],
    ['function f(s: string): string { const found = a; return found }', false],
    ['function f(s: string): boolean { const found = a; return other }', false],
    ['function f(s: string): boolean { const found = a; return }', false],
    [
      'function f(s: string): boolean { let found; found += a; return found }',
      false,
    ],
    ['function f(): boolean { const { found } = a; return found }', false],
    ['function f(): boolean { foo(a); return found }', false],
    ['const found = a', false],
  ])('answers a in %s with %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(isBooleanResultSource(find('Identifier', 'a'), context)).toBe(
      expected,
    )
  })
})
