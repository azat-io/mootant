import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

import { shout } from '../src/child'

it('shouts what a child process prints', () => {
  let text = String(
    execFileSync(process.execPath, [
      '-e',
      'process.stdout.write(process.env.MOOTANT_CHILD ?? "")',
    ]),
  )
  expect(shout(text)).toBe(text === '' ? 'none' : text.toUpperCase())
})
