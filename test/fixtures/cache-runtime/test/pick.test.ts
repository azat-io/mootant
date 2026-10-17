import { expect, it } from 'vitest'

import { pickRequire, pickImport } from '../src/pick'

it('picks', async () => {
  expect(await pickImport(true)).toBe(1)
  expect(pickRequire(true)).toBe(1)
})
