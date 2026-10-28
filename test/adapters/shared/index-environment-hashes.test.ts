import { describe, expect, it } from 'vitest'

import { indexEnvironmentHashes } from '../../../adapters/shared/index-environment-hashes'
import { createDigest } from '../../../core/cache/create-digest'

describe('indexEnvironmentHashes', () => {
  it('sorts the hashes by name and hashes all but volatile and ignored ones', () => {
    let hashes = indexEnvironmentHashes(
      [
        ['PWD', 'w'],
        ['B', 'b'],
        ['VITEST_POOL_ID', 'v'],
        ['A', 'a'],
      ],
      ['VITEST_POOL_ID'],
    )

    expect(hashes).toStrictEqual({
      '*': createDigest([
        ['A', 'a'],
        ['B', 'b'],
      ]),
      VITEST_POOL_ID: 'v',
      PWD: 'w',
      A: 'a',
      B: 'b',
    })
    expect(Object.keys(hashes)).toStrictEqual([
      'A',
      'B',
      'PWD',
      'VITEST_POOL_ID',
      '*',
    ])
  })

  it('hashes no variables at all', () => {
    expect(indexEnvironmentHashes([], [])).toStrictEqual({
      '*': createDigest([]),
    })
  })
})
