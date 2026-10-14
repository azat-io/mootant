import { describe, expect, it } from 'vitest'

import { isTailPosition } from '../../../../core/mutators/shared/is-tail-position'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isTailPosition', () => {
  it.each([
    'function f() { a() }',
    'function f() { b(); { a() } }',
    'let f = () => { if (x) a(); else b() }',
    'let f = function () { if (x) { a() } }',
    'function f() { try { a() } catch { b() } }',
    'function f() { try { b() } catch { a() } }',
    'function f() { try { b() } finally { a() } }',
    'function f() { label: a() }',
    "function f(k) { switch (k) { case 'x': b(); a() } }",
    "function f(k) { switch (k) { case 'x': b(); break; default: a() } }",
    "function f(k) { switch (k) { case 'x': a(); case 'y': default: } }",
    "function f(k) { switch (k) { case 'x': { a() } } }",
    'function f(k) { if (k) { switch (k) { default: a() } } }',
  ])('accepts a() in %s', source => {
    let { context, find } = createTestContext(source)
    let statement = context.sourceCode.getParent(find('CallExpression', 'a()'))!

    expect(isTailPosition(statement, context)).toBe(true)
  })

  it.each([
    'function f() { a(); b() }',
    'function f() { if (x) a(); b() }',
    'function f() { while (x) a() }',
    'function f() { { a() } b() }',
    'class A { static { a() } }',
    "function f(k) { switch (k) { case 'x': a(); b() } }",
    "function f(k) { switch (k) { case 'x': a(); case 'y': b() } }",
    "function f(k) { switch (k) { default: a(); case 'y': b() } }",
    "function f(k) { switch (k) { case 'x': a() } b() }",
    "switch (k) { case 'x': a() }",
    'a()',
    '{ a() }',
  ])('rejects a() in %s', source => {
    let { context, find } = createTestContext(source)
    let statement = context.sourceCode.getParent(find('CallExpression', 'a()'))!

    expect(isTailPosition(statement, context)).toBe(false)
  })
})
