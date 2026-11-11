import { describe, expect, it } from 'vitest'

import { insertJestFlags } from '../../../adapters/jest/insert-jest-flags'

describe('insertJestFlags', () => {
  it('adds the flags after the arguments', () => {
    expect(insertJestFlags(['-i', 'a'], ['--ci'])).toStrictEqual([
      '-i',
      'a',
      '--ci',
    ])
  })

  it('adds the flags before --', () => {
    expect(
      insertJestFlags(['-i', '--', 'a'], ['--ci', '--seed=1']),
    ).toStrictEqual(['-i', '--ci', '--seed=1', '--', 'a'])
  })
})
