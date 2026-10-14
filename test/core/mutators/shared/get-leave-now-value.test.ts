import { describe, expect, it } from 'vitest'

import { getLeaveNowValue } from '../../../../core/mutators/shared/get-leave-now-value'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getLeaveNowValue', () => {
  it.each<[string, boolean]>([
    ['for (;;) { if (a) break; step() }', true],
    ['for (;;) if (a) break', true],
    ['while (true) { if (!a) { break } }', false],
    ['for (; (true);) { if ((a)) break }', true],
    ['outer: for (;;) { if (a) break outer }', true],
  ])('finds the value of a in %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(getLeaveNowValue(find('Identifier', 'a'), context)).toBe(expected)
  })

  it.each([
    'for (;;) { step(); if (a) break }',
    'for (;;) { if (a) { stop(); break } }',
    'for (;;) { if (a) continue }',
    'while (1) { if (a) break }',
    'do { if (a) break } while (true)',
    'while (b) { if (a) break }',
    'for (;;) { if (b) break; if (a) break }',
    'for (;;) { if (f(a)) break }',
    'for (;;) { x = a }',
    'for (;;) {}; if (a) {}',
    'outer: for (x of y) { for (;;) { if (a) break outer } }',
    'outer: for (;;) { inner: for (;;) { if (a) break outer } }',
    'outer: inner: for (;;) { if (a) break outer }',
  ])('finds no value for a in %s', source => {
    let { context, find } = createTestContext(source)

    expect(getLeaveNowValue(find('Identifier', 'a'), context)).toBeNull()
  })
})
