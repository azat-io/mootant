import { inject, it } from 'vitest'

import { spin } from '../lib/hang'

let calls = 0

it('loops on the second call', { timeout: 100 }, () => {
  calls += 1
  let options = inject('mootant' as never) as
    undefined | { timeouts: { test: number } | null }
  if (calls > 1 && options?.timeouts?.test === 321) {
    spin()
  }
})
