import { expect, it, vi } from 'vitest'

// The helper loads first, as the factory runs when the service imports the
// module it mocks.
import { loadActual } from './actual'
import { greet } from '../src/service'

// Loads the real module through a helper, so Vitest takes it for replaced.
vi.mock('../src/api', async () => ({
  ...(await loadActual('../src/api')),
}))

it('greets the real user', async () => {
  expect(await greet(2)).toBe('Hello, user2!')
})
