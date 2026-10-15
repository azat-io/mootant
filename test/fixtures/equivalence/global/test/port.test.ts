import { expect, inject, it } from 'vitest'

import { host } from '../src/port'

it('gets the port from the global setup', () => {
  expect(inject('port')).toBe(4001)
})

it('names the host', () => {
  expect(host()).toBe('localhost')
})
