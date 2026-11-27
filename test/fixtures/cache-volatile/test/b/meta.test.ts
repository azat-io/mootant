import { expect, it } from 'vitest'

import { isTime } from '../../src/meta'

it('tells that the time on import.meta is a time', () => {
  let { buildTime } = import.meta as unknown as { buildTime: string }
  expect(isTime(buildTime)).toBe(true)
  expect(isTime('now')).toBe(false)
})
