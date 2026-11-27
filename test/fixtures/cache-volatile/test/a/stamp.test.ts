import { expect, it } from 'vitest'

import { year } from '../../src/stamp'

declare const __BUILD_TIME__: string

it('reads the year of the build', () => {
  expect(year(__BUILD_TIME__)).toBe(new Date(__BUILD_TIME__).getUTCFullYear())
})
