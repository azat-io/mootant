import { expect, it } from 'vitest'

import { isOn } from '../src/flag'

it('reads the flag the environment set up', () => {
  expect(isOn(Reflect.get(globalThis, 'mootantFlag') as string)).toBe(false)
})
