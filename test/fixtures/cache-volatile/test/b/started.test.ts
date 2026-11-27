import { expect, it } from 'vitest'

import { isTime } from '../../src/started'

declare const app: { started: string }

it('tells that the start of the configuration is a time', () => {
  expect(isTime(app.started)).toBe(true)
  expect(isTime('now')).toBe(false)
})
