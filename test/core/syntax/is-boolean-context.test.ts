import { describe, expect, it } from 'vitest'

import { isBooleanContext } from '../../../core/syntax/is-boolean-context'
import { createTestFile } from '../../helpers/create-test-file'

describe('isBooleanContext', () => {
  it.each([
    'if (a) {}',
    'while ((a as boolean)) {}',
    'do {} while (a)',
    'for (; a;) {}',
    'x = a ? b : c',
    'if (b ? a : c) {}',
    'if (b ? c : (a)) {}',
    'x = !a',
    'if (a && b) {}',
    'x = !(b || a)',
    'if (b ?? a) {}',
    'if ((b, a)) {}',
    'x = Boolean(a)',
    'x = Boolean(a, extra)',
    'x = Boolean?.(a)',
    'x = (Boolean)(a)',
    'x = (Boolean as Function)((a))',
    'items.filter(item => a)',
    'items.some(item => (a as boolean))',
    'items?.find(item => a)',
    'items.every(item => { return a })',
    'items.findIndex(function () { if (b) { return a } })',
    'items.findLast(item => a && b)',
    'items.findLastIndex((item => a))',
  ])('accepts a in %s', source => {
    let { scopes, find, tree } = createTestFile(source)

    expect(isBooleanContext(tree, scopes, find('Identifier', 'a'))).toBe(true)
  })

  it.each([
    'x = b ? a : c',
    'x = -a',
    'x = a && b',
    'if (a ?? b) {}',
    'if ((a, b)) {}',
    'x = (a, b) || c',
    'x = Boolean(b, a)',
    'x = String(a)',
    'x = window.Boolean(a)',
    ['let Boolean = f', 'x = Boolean(a)'].join('\n'),
    'items.map(item => a)',
    'items.filter(callback, item => a)',
    'items[filter](item => a)',
    'filter(item => a)',
    'x = item => a',
    'items.filter(item => f(a))',
    'items.filter(item => { let x = () => a })',
    'items.filter(a => b)',
    'function f() { return a }',
    'x = a',
  ])('rejects a in %s', source => {
    let { scopes, find, tree } = createTestFile(source)

    expect(isBooleanContext(tree, scopes, find('Identifier', 'a'))).toBe(false)
  })

  it('rejects a spread first argument of Boolean', () => {
    let { scopes, find, tree } = createTestFile('x = Boolean(...a)')

    expect(isBooleanContext(tree, scopes, find('SpreadElement'))).toBe(false)
  })

  it('rejects the block body of a predicate callback', () => {
    let { scopes, find, tree } = createTestFile('items.filter(item => {})')

    expect(isBooleanContext(tree, scopes, find('BlockStatement'))).toBe(false)
  })

  it('rejects a returned value at the top level of a script', () => {
    let { scopes, find, tree } = createTestFile('return a', 'example.cjs')

    expect(isBooleanContext(tree, scopes, find('Identifier', 'a'))).toBe(false)
  })

  it('returns false for the program', () => {
    let { scopes, find, tree } = createTestFile('if (a) {}')

    expect(isBooleanContext(tree, scopes, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { scopes, tree } = createTestFile('if (a) {}')
    let other = createTestFile('if (a) {}')

    expect(() =>
      isBooleanContext(tree, scopes, other.find('Identifier', 'a')),
    ).toThrow('Node is not part of the runtime tree of the file.')
  })
})
