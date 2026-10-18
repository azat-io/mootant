import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'

import { hashEnvironment } from '../../../adapters/node-test/hash-environment'
import { createDigest } from '../../../core/cache/create-digest'

/**
 * Hashes a value as the environment hashes do.
 *
 * @param value - Value of a variable.
 * @returns SHA-256 in hex.
 */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

describe('hashEnvironment', () => {
  it('hashes each value and all but volatile ones together', () => {
    let hashes = hashEnvironment({
      PWD: '/here',
      C: undefined,
      B: 'two',
      A: 'one',
    })

    expect(hashes).toStrictEqual({
      '*': createDigest([
        ['A', hash('one')],
        ['B', hash('two')],
      ]),
      PWD: hash('/here'),
      A: hash('one'),
      B: hash('two'),
    })
    expect(Object.keys(hashes)).toStrictEqual(['A', 'B', 'PWD', '*'])
  })
})
