import { describe, expect, it } from 'vitest'

import { getRunningValue } from '../../../../core/mutators/shared/get-running-value'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getRunningValue', () => {
  it.each<[string, boolean, string]>([
    ['while (a) {}', true, 'WhileStatement'],
    ['do {} while ((a as boolean))', true, 'DoWhileStatement'],
    ['for (; a;) {}', true, 'ForStatement'],
    ['while (!a) {}', false, 'WhileStatement'],
    ['while (b && !(!a)) {}', true, 'WhileStatement'],
    ['for (;;) { if (a) break }', false, 'ForStatement'],
    ['while (true) { if (b || a) { return } }', false, 'WhileStatement'],
    ['for (;;) { if (!a) break }', true, 'ForStatement'],
    ['for (;;) { while (true) { if (a) return } }', false, 'WhileStatement'],
    ['x: for (y of z) { for (;;) { if (a) break x } }', false, 'ForStatement'],
  ])('finds the running value of a in %s', (source, value, loop) => {
    let { context, find } = createTestContext(`function f() { ${source} }`)
    let running = getRunningValue(find('Identifier', 'a'), context)

    expect(running?.value).toBe(value)
    expect(running?.loop.type).toBe(loop)
  })

  it.each([
    'if (a) {}',
    'while (b) { if (a) break }',
    'for (;;) { if (a) foo() }',
    'while (a ?? b) {}',
    'while (f(a)) {}',
    'x = a',
  ])('finds no running value of a in %s', source => {
    let { context, find } = createTestContext(source)

    expect(getRunningValue(find('Identifier', 'a'), context)).toBeNull()
  })
})
