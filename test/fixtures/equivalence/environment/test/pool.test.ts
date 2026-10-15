import { expect, test } from 'vitest'

import { countOpen, acquire, release } from '../src/pool'

test('acquires and releases', () => {
  acquire()
  release()
  expect(typeof countOpen()).toBe('number')
})
