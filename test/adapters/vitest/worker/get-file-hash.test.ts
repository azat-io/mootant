import { describe, expect, it } from 'vitest'

import { getFileHash } from '../../../../adapters/vitest/worker/get-file-hash'

describe('getFileHash', () => {
  it('names a path of a project with 16 stable hexadecimal digits', () => {
    expect(getFileHash('/a/b.test.ts', '')).toMatch(/^[\da-f]{16}$/u)
    expect(getFileHash('/a/b.test.ts', '')).toBe(
      getFileHash('/a/b.test.ts', ''),
    )
    expect(getFileHash('/a/c.test.ts', '')).not.toBe(
      getFileHash('/a/b.test.ts', ''),
    )
    expect(getFileHash('/a/b.test.ts', 'unit')).not.toBe(
      getFileHash('/a/b.test.ts', ''),
    )
  })
})
