import { describe, expect, it } from 'vitest'

import { getSettingsProblem } from '../../../core/plugins/get-settings-problem'

describe('getSettingsProblem', () => {
  it.each<[unknown, string | null]>([
    [{}, null],
    [{ coarseMutants: true, timeouts: false }, null],
    [[], 'they are not an object'],
    [
      { timeout: true },
      '"timeout" is not a setting (did you mean "timeouts"?)',
    ],
    [{ unrelatedThing: true }, '"unrelatedThing" is not a setting'],
    [{ timeouts: 'yes' }, '"timeouts" is not true or false'],
  ])('describes %o', (value, expected) => {
    expect(getSettingsProblem(value)).toBe(expected)
  })
})
