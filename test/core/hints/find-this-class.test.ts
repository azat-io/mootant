import { describe, expect, it } from 'vitest'

import { findThisClass } from '../../../core/hints/find-this-class'
import { createTestFile } from '../../helpers/create-test-file'

describe('findThisClass', () => {
  it.each([
    { source: 'class C { m() { this } }', isStatic: false },
    { source: 'class C { static m() { this } }', isStatic: true },
    { source: 'class C { get m() { return this } }', isStatic: false },
    { source: 'class C { x = this }', isStatic: false },
    { source: 'class C { static x = () => this }', isStatic: true },
    { source: 'class C { accessor x = this }', isStatic: false },
    { source: 'class C { static { this } }', isStatic: true },
    { source: 'class C { m() { return () => () => this } }', isStatic: false },
  ])('finds the class of this in $source', ({ isStatic, source }) => {
    let { find, tree } = createTestFile(source)

    expect(findThisClass(tree, find('ThisExpression'))).toStrictEqual({
      body: find('ClassBody'),
      isStatic,
    })
  })

  it('finds the innermost class', () => {
    let { find, tree } = createTestFile(
      'class A { m() { return class B { n() { this } } } }',
    )

    expect(findThisClass(tree, find('ThisExpression'))).toStrictEqual({
      body: find('ClassBody', undefined, 1),
      isStatic: false,
    })
  })

  it.each([
    'this',
    'function f() { this }',
    'x = function () { this }',
    'class C { m() { function f() { this } } }',
    'class C { m() { x = function () { this } } }',
    'class C { [this.k] = 1 }',
    'x = { m() { this } }',
  ])('returns null for this in %s', source => {
    let { find, tree } = createTestFile(source)

    expect(findThisClass(tree, find('ThisExpression'))).toBeNull()
  })
})
