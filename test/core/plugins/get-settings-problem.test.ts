import { describe, expect, it } from 'vitest'

import { getSettingsProblem } from '../../../core/plugins/get-settings-problem'

describe('getSettingsProblem', () => {
  it.each<[unknown, string | null]>([
    [{}, null],
    [{ coarseMutants: true, templates: false, timeouts: false }, null],
    [
      { template: false },
      '"template" is not a setting (did you mean "templates"?)',
    ],
    [[], 'they are not an object'],
    [
      { timeout: true },
      '"timeout" is not a setting (did you mean "timeouts"?)',
    ],
    [{ unrelatedThing: true }, '"unrelatedThing" is not a setting'],
    [{ timeouts: 'yes' }, '"timeouts" is not true or false'],
    [{ loggers: [] }, null],
    [{ loggers: ['consola', 'signale'], timeouts: true }, null],
    [{ loggers: 'consola' }, '"loggers" is not an array of receiver names'],
    [{ loggers: ['consola', 1] }, '"loggers" item 1 is not a non-empty string'],
    [{ loggers: [''] }, '"loggers" item 0 is not a non-empty string'],
    [{ logger: [] }, '"logger" is not a setting (did you mean "loggers"?)'],
  ])('describes %o', (value, expected) => {
    expect(getSettingsProblem(value)).toBe(expected)
  })
})
