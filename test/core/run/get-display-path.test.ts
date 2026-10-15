import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { getDisplayPath } from '../../../core/run/get-display-path'

describe('getDisplayPath', () => {
  it('makes a path relative to the root with slashes', () => {
    let root = path.resolve('/project')

    expect(getDisplayPath(path.join(root, 'test', 'a.test.ts'), root)).toBe(
      'test/a.test.ts',
    )
  })
})
