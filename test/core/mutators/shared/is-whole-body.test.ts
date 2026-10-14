import { describe, expect, it } from 'vitest'

import { isWholeBody } from '../../../../core/mutators/shared/is-whole-body'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isWholeBody', () => {
  it.each<[string, 'ReturnStatement' | 'IfStatement', boolean]>([
    ['let f = r => { return r.ok }', 'ReturnStatement', true],
    ['let f = r => { if (r.ok) return 1; return 0 }', 'IfStatement', true],
    ['let f = r => { if (r.ok) return 1; else return 0 }', 'IfStatement', true],
    ['let f = r => { a(r); return r.ok }', 'ReturnStatement', false],
    [
      'let f = r => { a(r); if (r.ok) return 1; return 0 }',
      'IfStatement',
      false,
    ],
    ['let f = r => { if (r.ok) a(); a() }', 'IfStatement', false],
    [
      'let f = r => { if (r.ok) return 1; a(); return 0 }',
      'IfStatement',
      false,
    ],
  ])('answers %s', (source, type, expected) => {
    let { context, find } = createTestContext(source)
    let statement = find(type)
    let enclosing = context.syntax.getEnclosingFunction(statement)!

    expect(isWholeBody(enclosing, statement)).toBe(expected)
  })
})
