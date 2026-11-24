import { describe, expect, it } from 'vitest'

import { createDryReuseMiss } from '../../../core/cache/create-dry-reuse-miss'

describe('createDryReuseMiss', () => {
  it('tells why the dry run of an earlier run was not reused', () => {
    let miss = createDryReuseMiss('src/a.test.ts changed')

    expect(miss).toBeInstanceOf(Error)
    expect(miss.name).toBe('DryReuseMiss')
    expect(miss.message).toBe(
      'Did not reuse the dry run of an earlier run, as src/a.test.ts changed.',
    )
  })
})
