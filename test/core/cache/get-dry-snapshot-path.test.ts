import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { getDrySnapshotPath } from '../../../core/cache/get-dry-snapshot-path'

describe('getDrySnapshotPath', () => {
  it('puts the saved dry run next to the cache file', () => {
    expect(getDrySnapshotPath('/project')).toBe(
      path.join('/project', 'node_modules/.cache/mootant/dry-v8.json'),
    )
  })
})
