import { expect, it } from 'vitest'

import { sum } from '../src/sum'

it('knows where it stands', ({ task }) => {
  sum(1, 2)
  expect(task.location?.line).toBe(5)
})
