import { describe, expect, it } from 'vitest'
import { runInThisContext } from 'node:vm'

import { getSiteCheck } from '../../../core/instrument/get-site-check'

describe('getSiteCheck', () => {
  it('calls the runtime global with the id', () => {
    expect(getSiteCheck('abc123')).toBe('globalThis.__mootant?.hit("abc123")')
  })

  it('is undefined without a runtime', () => {
    expect(runInThisContext(getSiteCheck('a'))).toBeUndefined()
  })
})
