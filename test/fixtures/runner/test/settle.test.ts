import { expect, it } from 'vitest'

import { settle } from '../src/settle'

it('settles', async () => {
  await expect(settle(true)).resolves.toBe('done')
})
