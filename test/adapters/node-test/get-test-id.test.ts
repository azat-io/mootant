import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { getTestId } from '../../../adapters/node-test/get-test-id'
import { createDigest } from '../../../core/cache/create-digest'

describe('getTestId', () => {
  it('hashes the relative path, name and occurrence', () => {
    let root = path.resolve('/project')
    let id = getTestId(root, path.join(root, 'test', 'a.test.js'), {
      name: 'suite > a',
      occurrence: 1,
    })

    expect(id).toBe(
      createDigest(['test/a.test.js', 'suite > a', 1]).slice(0, 16),
    )
    expect(
      getTestId(path.resolve('/other'), path.resolve('/other/test/a.test.js'), {
        name: 'suite > a',
        occurrence: 1,
      }),
    ).toBe(id)
    expect(
      getTestId(root, path.join(root, 'test', 'a.test.js'), {
        name: 'suite > a',
        occurrence: 0,
      }),
    ).not.toBe(id)
  })
})
