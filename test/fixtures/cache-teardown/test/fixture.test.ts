import { readFileSync } from 'node:fs'
import { expect, test as base } from 'vitest'

import { double } from '../src/fixture'

let test = base.extend<object, { checked: string }>({
  checked: [
    async ({}, use) => {
      await use('ready')
      let text = readFileSync(new URL('fixture.txt', import.meta.url), 'utf8')
      if (text.trim() === 'fail' || process.env.MOOTANT_FIXTURE === 'fail') {
        throw new Error('The fixture teardown failed')
      }
    },
    { scope: 'worker' },
  ],
})

test('doubles a value', ({ checked }) => {
  expect(checked).toBe('ready')
  expect(double(3)).toBe(6)
})
