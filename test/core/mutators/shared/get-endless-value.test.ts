import { describe, expect, it } from 'vitest'

import { getEndlessValue } from '../../../../core/mutators/shared/get-endless-value'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Finds the value of `a` that may keep its loop running forever.
 *
 * @param source - Body of an async generator function.
 * @returns What `getEndlessValue` says for the first `a`.
 */
function check(source: string): boolean | null {
  let { context, find } = createTestContext(`async function* f() { ${source} }`)
  return getEndlessValue(find('Identifier', 'a'), context)
}

describe('getEndlessValue', () => {
  it.each<[string, boolean]>([
    ['while (a) {}', true],
    ['do {} while (!a)', false],
    ['while (a && b) {}', true],
    ['while (a) { if (b) break }', true],
    ['for (; a; ) { if (b) return }', true],
    ['for (;;) { if (a) break }', false],
    ['while (true) { if (!a) { return } }', true],
    ['for (;;) { if (a && b) break }', false],
    ['for (;;) { if (!(a || b)) break }', true],
    ['for (;;) { if (a) { stop(); return } }', false],
    ['for (;;) { if (a) break; if (b) continue }', false],
    ['for (;;) { if (a) break; switch (b) { case 1: break } }', false],
    ['for (;;) { if (a) break; for (const c of d) break }', false],
    ['for (;;) { if (a) break; y: { break y } }', false],
    ['x: for (;;) { if (a) break; continue x }', false],
    ['for (;;) { if (a) break; run(() => { return 1 }) }', false],
    ['for (;;) { if (a) break; let g = function () { return 1 } }', false],
    ['for (;;) { if (a) break; try { throw b } catch {} }', false],
    [
      'for (;;) { if (a) break; @d(class { static { throw b } }) class C {} }',
      false,
    ],
    [
      'for (;;) { if (a) break; class C { x = class { static { throw b } } } }',
      false,
    ],
    [
      'for (;;) { if (a) break; class C { accessor x = (class { static { throw b } }) } }',
      false,
    ],
    ['for (;;) { if (a) break; await b; yield c; d(); new E() }', false],
    ['for (;;) { for (;;) { if (a) return; if (b) break } }', false],
    ['for (;;) { if (b) break; for (;;) { if (a) return } }', false],
  ])('finds the endless value of a in %s', (source, expected) => {
    expect(check(source)).toBe(expected)
  })

  it.each([
    'if (a) {}',
    'x = a',
    'for (;;) { if (a) foo() }',
    'for (;;) { if (a) break; if (b) break }',
    'for (;; (class { static { throw b } })) { if (a) break }',
    'for (;;) { if (a) break; class C { static x = class { static { throw b } } } }',
    'for (;;) { if (a) break; return }',
    'for (;;) { if (a) break; else return; b() }',
    'for (;;) { if (a) break; if (b) throw c }',
    'for (;;) { if (a) break; try { throw b } finally {} }',
    'for (;;) { if (a) break; try {} catch { throw b } }',
    'x: for (c of d) { for (;;) { if (a) break; continue x } }',
    'x: for (;;) { for (;;) { if (a) break x; break x } }',
    'for (;;) { if (a || b) break }',
    'for (;;) { if (!(a && b)) break }',
    'for (;;) { for (;;) { if (a) return; if (b) return } }',
  ])('finds no endless value of a in %s', source => {
    expect(check(source)).toBeNull()
  })
})
