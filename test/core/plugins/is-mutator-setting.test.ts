import { describe, expect, it } from 'vitest'

import { isMutatorSetting } from '../../../core/plugins/is-mutator-setting'

describe('isMutatorSetting', () => {
  it.each<[unknown, boolean]>([
    ['on', true],
    ['off', true],
    [['on', {}], true],
    [['on', { anyReceiver: true }], true],
    ['error', false],
    [['off', {}], false],
    [['on'], false],
    [['on', {}, {}], false],
    [['on', 'x'], false],
    [true, false],
  ])('answers %o with %s', (value, expected) => {
    expect(isMutatorSetting(value)).toBe(expected)
  })
})
