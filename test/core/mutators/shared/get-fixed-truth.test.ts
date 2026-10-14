import { describe, expect, it } from 'vitest'

import { getFixedTruth } from '../../../../core/mutators/shared/get-fixed-truth'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getFixedTruth', () => {
  it.each<[string, boolean | null]>([
    ['x = true', true],
    ['x = !true', false],
    ["x = !!('')", false],
    ['x = 1', true],
    ['x = null', false],
    ['const o = {}; x = o', true],
    ['x = undefined', false],
    ['let v: null = null; x = v', false],
    ['x = y && false', false],
    ['x = false && y', false],
    ['x = 1 && true', true],
    ['x = y || 1', true],
    ['x = 0 || 0', false],
    ['x = y && true', null],
    ['let s: string = f(); x = typeof s === "string"', true],
    ['let s: string = f(); x = s === null', false],
    ['x = y === z', null],
    ['x = y', null],
  ])('reads %s as %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(getFixedTruth(find('AssignmentExpression').right, context)).toBe(
      expected,
    )
  })
})
