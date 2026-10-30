import { describe, expect, it } from 'vitest'

import { getRunningValue } from '../../../../core/mutators/shared/get-running-value'
import { hasOtherExit } from '../../../../core/mutators/shared/has-other-exit'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Tells whether the loop of a comparison can end other than through it.
 *
 * @param source - Body of an async generator function.
 * @param comparison - Text of the comparison, `i !== n` when omitted.
 * @returns What `hasOtherExit` says for the comparison.
 */
function check(source: string, comparison = 'i !== n'): boolean {
  let { context, find } = createTestContext(`async function* f() { ${source} }`)
  let node = find('BinaryExpression', comparison)
  return hasOtherExit(node, getRunningValue(node, context)!, context)
}

describe('hasOtherExit', () => {
  it.each([
    'for (let i = 0; i !== n; i++) { if (i > 9) break }',
    'for (let i = 0; i !== n; i++) { if (found) return; log(i) }',
    'for (let i = 0; i !== n; i++) yield i',
    'for (let i = 0; i !== n; i++, yield) {}',
    'for (let i = 0; i !== n && i < 9; i++) {}',
    'while (more && i !== n) i++',
    'do { if (done) break; i++ } while (i !== n)',
    'for (let i = 0; i !== n; i++) { switch (i) { default: return } }',
    'for (let i = 0; i !== n; i++) { try {} catch (error) { throw error } }',
    'for (let i = 0; i !== n; i++) { try { throw error } finally {} }',
    'for (let i = 0; i !== n; i++) { try { throw error } catch {} }',
    'for (let i = 0; i !== n; i++) { if (i > 9) fail() }',
    'for (let i = 0; i !== n; i++) error = new Failure(i)',
    'for (let i = 0; i !== n; i++) label = tag`step`',
    "for (let i = 0; i !== n; i++) step = import('./step')",
    'for (let i = 0; i !== n; i++) await pause',
    'x: for (let i = 0; i !== n; i++) { for (;;) break x }',
    'x: for (;;) { for (let i = 0; i !== n; i++) continue x }',
  ])('finds another exit in %s', source => {
    expect(check(source)).toBe(true)
  })

  it.each([
    'while (!(i === n || done)) i++',
    'for (;;) { if (i === n || done) break; i++ }',
    'for (;;) { if (i === n) break; if (i > 9) break; i++ }',
    'for (;;) { if (i === n) break; else return }',
  ])('finds another exit of the loop of i === n in %s', source => {
    expect(check(source, 'i === n')).toBe(true)
  })

  it.each([
    'for (let i = 0; i !== n; i++) {}',
    'for (let i = 0; i !== n || more; i++) {}',
    'for (let i = 0; i !== n; i++) continue',
    'for (let i = 0; i !== n; i++) { switch (i) { case 1: break } }',
    'for (let i = 0; i !== n; i++) { while (true) break }',
    'for (let i = 0; i !== n; i++) { for (const item of items) break }',
    'for (let i = 0; i !== n; i++) { y: { break y } }',
    'for (let i = 0; i !== n; i++) { z: for (;;) continue z }',
    'x: y: for (let i = 0; i !== n; i++) { continue x }',
    'for (let i = 0; i !== n; i++) { handle = () => { return read() } }',
    'for (let i = 0; i !== n; i++) { let x: number = i }',
  ])('finds no other exit in %s', source => {
    expect(check(source)).toBe(false)
  })

  it.each([
    'while (!(i === n)) i++',
    'for (;;) { if (i === n && ready) break; i++ }',
    'for (;;) { if (i === n) { log(i); return } i++ }',
  ])('finds no other exit of the loop of i === n in %s', source => {
    expect(check(source, 'i === n')).toBe(false)
  })
})
