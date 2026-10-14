import { describe, expect, it } from 'vitest'

import { getCallbackResult } from '../../../../core/mutators/shared/get-callback-result'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getCallbackResult', () => {
  it.each<{
    isSwitch: boolean
    negated: boolean
    source: string
    owner: string
  }>([
    {
      source: 'rows.sort(r => a)',
      isSwitch: false,
      negated: false,
      owner: 'sort',
    },
    {
      source: 'rows.toSorted(r => !(a))',
      owner: 'toSorted',
      isSwitch: false,
      negated: true,
    },
    {
      source: 'rows.sort(function (r) { return a })',
      isSwitch: false,
      negated: false,
      owner: 'sort',
    },
    {
      source: 'rows.sort(r => { if (a) return 1; return 0 })',
      negated: false,
      isSwitch: true,
      owner: 'sort',
    },
    {
      source: 'rows.sort(r => { if (!a) { return 1 } else { return -1 } })',
      isSwitch: true,
      owner: 'sort',
      negated: true,
    },
  ])('finds the result of $source', ({ isSwitch, negated, source, owner }) => {
    let { context, find } = createTestContext(source)
    let result = getCallbackResult(find('Identifier', 'a'), context)!

    expect(result.owner).toBe(owner)
    expect(result.negated).toBe(negated)
    expect(result.returnSwitch !== null).toBe(isSwitch)
  })

  it.each([
    'rows.map(r => a)',
    'rows.filter(r => a)',
    'rows.sort(r => { if (r) return 1; return a })',
    'rows.sort(r => { if (r) return 1; foo(a) })',
    'rows.sort(r => { return a; foo() })',
    'rows.sort(r => { foo(() => { return a }) })',
    'rows.sort(function (r) { if (r) return a; return 1 })',
    'rows.sort(r => { if (a) foo(); return true })',
    'rows.sort(function (r) { foo(); return a })',
    'rows.sort(r => { foo(); if (a) return true; return false })',
    'rows.sort(r => { if (a) return true; foo(); return false })',
    'rows.sort((r = a) => r)',
    'rows.sort(r => a + 1)',
    'if (a) {}',
    'x = a',
  ])('finds no result for a in %s', source => {
    let { context, find } = createTestContext(source)

    expect(getCallbackResult(find('Identifier', 'a'), context)).toBeNull()
  })

  it('finds no result for a returned value outside functions', () => {
    let { context, find } = createTestContext('return a', {
      file: 'example.cjs',
    })

    expect(getCallbackResult(find('Identifier', 'a'), context)).toBeNull()
  })
})
