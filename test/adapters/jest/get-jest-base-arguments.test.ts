import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { getJestBaseArguments } from '../../../adapters/jest/get-jest-base-arguments'

describe('getJestBaseArguments', () => {
  it("lists the flags with mootant's cache directory and a seed", () => {
    expect(getJestBaseArguments('/project', ['-i'], null)).toStrictEqual([
      '--ci',
      '--no-coverage',
      `--cacheDirectory=${path.join('/project/node_modules/.cache/mootant/jest')}`,
      '--watch=false',
      '--watchAll=false',
      '--onlyChanged=false',
      '--onlyFailures=false',
      '--lastCommit=false',
      '--changedFilesWithAncestor=false',
      '--seed=1',
    ])
  })

  it.each([[['--seed=5']], [['--seed', '5']]])(
    'adds no seed to %j',
    arguments_ => {
      let base = getJestBaseArguments('/project', arguments_, null)

      expect(base.filter(word => word.startsWith('--seed'))).toStrictEqual([])
      expect(base).toContain('--ci')
    },
  )

  it('takes a flag that starts like --seed for no seed', () => {
    expect(getJestBaseArguments('/project', ['--seeded'], null)).toContain(
      '--seed=1',
    )
  })

  it('takes a word after -- for no seed, as it is a test path pattern', () => {
    expect(
      getJestBaseArguments('/project', ['--', '--seed=5'], null),
    ).toContain('--seed=1')
  })

  it('adds the workers of a concurrency, and none without one', () => {
    expect(getJestBaseArguments('/project', [], 4).at(-1)).toBe(
      '--maxWorkers=4',
    )
    expect(
      getJestBaseArguments('/project', [], null).filter(word =>
        word.startsWith('--maxWorkers'),
      ),
    ).toStrictEqual([])
  })
})
