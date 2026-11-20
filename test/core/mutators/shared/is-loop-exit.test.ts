import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isLoopExit } from '../../../../core/mutators/shared/is-loop-exit'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Tells whether the first node of a type leaves a `for` loop of a snippet.
 *
 * @param source - Body of a function.
 * @param type - Type of the node to check.
 * @param nth - 0-based position of the loop among the `for` loops.
 * @returns What `isLoopExit` says for the node and the loop.
 */
function check(source: string, type: Node['type'], nth: number): boolean {
  let { context, find } = createTestContext(`function f() { ${source} }`)
  return isLoopExit(find(type), find('ForStatement', undefined, nth), context)
}

describe('isLoopExit', () => {
  it.each<[string, Node['type'], number]>([
    ['for (;;) { if (a) return }', 'ReturnStatement', 0],
    ['for (;;) throw error', 'ThrowStatement', 0],
    ['for (;;) { if (a) throw error }', 'ThrowStatement', 0],
    ['for (;;) { for (;;) { throw error } }', 'ThrowStatement', 0],
    ['for (;;) { try { throw error } finally {} }', 'ThrowStatement', 0],
    ['for (;;) { try {} catch (error) { throw error } }', 'ThrowStatement', 0],
    ['for (;;) { try {} finally { throw error } }', 'ThrowStatement', 0],
    ['try { for (;;) { throw error } } catch {}', 'ThrowStatement', 0],
    ['for (;;) { if (a) break }', 'BreakStatement', 0],
    ['x: for (;;) { for (;;) break x }', 'BreakStatement', 0],
    ['x: for (;;) { for (;;) continue x }', 'ContinueStatement', 1],
  ])('finds that the statement leaves the loop in %s', (source, type, nth) => {
    expect(check(source, type, nth)).toBe(true)
  })

  it.each<[string, Node['type'], number]>([
    ['for (;;) { try { throw error } catch {} }', 'ThrowStatement', 0],
    [
      'for (;;) { try { if (a) { throw error } } catch {} }',
      'ThrowStatement',
      0,
    ],
    [
      'for (;;) { for (;;) { try { throw error } catch {} } }',
      'ThrowStatement',
      0,
    ],
    ['for (;;) { continue }', 'ContinueStatement', 0],
    ['for (;;) { switch (a) { case 1: break } }', 'BreakStatement', 0],
    ['for (;;) { for (;;) break }', 'BreakStatement', 0],
    ['for (;;) { y: { break y } }', 'BreakStatement', 0],
    ['x: for (;;) { continue x }', 'ContinueStatement', 0],
    ['for (;;) { a() }', 'ExpressionStatement', 0],
  ])(
    'finds that the statement stays in the loop in %s',
    (source, type, nth) => {
      expect(check(source, type, nth)).toBe(false)
    },
  )
})
