import { test as base, expect } from 'vitest'
import { createServer } from 'node:net'

import { countOpen, acquire, release } from '../src/pool'

let test = base.extend(
  'leaks',
  { scope: 'worker', auto: true },
  async ({}, { onCleanup }) => {
    // Holds a fixed port for the whole worker, as a database or a server
    // would: a second worker on this file fails to listen until it is freed.
    let server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(47_391, '127.0.0.1', resolve)
    })
    onCleanup(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 200)
      })
      await new Promise(resolve => {
        server.close(resolve)
      })
      if (countOpen() !== 0) {
        throw new Error(`${countOpen()} left open`)
      }
    })
    return 'checked'
  },
)

test('acquires and releases', () => {
  acquire()
  release()
  expect(typeof countOpen()).toBe('number')
})
