import { describe, expect, it } from 'vitest'

import { createBailError } from '../../../../adapters/node-test/preload/create-bail-error'

describe('createBailError', () => {
  it('creates an error that tells the skip apart', () => {
    let error = createBailError()

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('MootantBailError')
    expect(error.message).toBe(
      'mootant skipped the test, since an earlier test already failed with the mutant active.',
    )
  })
})
