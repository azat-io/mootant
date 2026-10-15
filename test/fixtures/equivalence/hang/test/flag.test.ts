import { expect, it } from 'vitest'

import { flag } from '../src/flag'

let calls = 0

it('loops on repeat', { timeout: 100 }, () => {
  calls += 1
  if (calls > 1) {
    for (;;) {
      // A second call never returns.
    }
  }
  expect(flag()).toBe(true)
})
