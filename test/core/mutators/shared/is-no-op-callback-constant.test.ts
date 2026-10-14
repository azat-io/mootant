import { describe, expect, it } from 'vitest'

import { isNoOpCallbackConstant } from '../../../../core/mutators/shared/is-no-op-callback-constant'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isNoOpCallbackConstant', () => {
  it.each<[string, boolean, boolean]>([
    ['rows.filter(r => a)', true, false],
    ['rows.filter(r => a)', false, false],
    ['rows.filter(r => !a)', false, false],
    ['rows.toSorted(r => a)', false, false],
    ['rows.sort(r => !a)', true, true],
    ['rows.sort(r => a)', false, true],
    ['rows.sort(r => a)', true, false],
    ['rows.filter(r => { if (a) return true; return false })', true, false],
    ['rows.sort(r => { if (a) return 0; return 1 })', true, true],
    ['rows.sort(r => { if (a) return 0; return 1 })', false, false],
    ['rows.sort(r => { if (a) return 1; return 0 })', false, true],
    ['rows.sort(r => { if (!a) return 1; return -1 })', true, false],
    ['rows.map(r => a)', true, false],
  ])('answers %s with the constant %s', (source, value, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      isNoOpCallbackConstant(find('Identifier', 'a'), value, context),
    ).toBe(expected)
  })
})
