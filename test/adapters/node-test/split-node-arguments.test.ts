import { describe, expect, it } from 'vitest'

import { splitNodeArguments } from '../../../adapters/node-test/split-node-arguments'

describe('splitNodeArguments', () => {
  it('groups flags with their values and keeps the rest as files', () => {
    expect(
      splitNodeArguments([
        '--import',
        'tsx',
        '--test',
        '--test-name-pattern=a',
        '-r',
        './setup.cjs',
        'test/*.js',
        '--test-only',
      ]),
    ).toStrictEqual({
      flags: [
        ['--import', 'tsx'],
        ['--test'],
        ['--test-name-pattern=a'],
        ['-r', './setup.cjs'],
      ],
      files: ['test/*.js', '--test-only'],
    })
  })

  it('stops flags at -- and at a lone dash', () => {
    expect(splitNodeArguments(['--test', '--', '--odd.js'])).toStrictEqual({
      files: ['--odd.js'],
      flags: [['--test']],
    })
    expect(splitNodeArguments(['--test', '-'])).toStrictEqual({
      flags: [['--test']],
      files: ['-'],
    })
  })

  it('takes a value flag at the end as a flag alone', () => {
    expect(splitNodeArguments(['--test', '--import'])).toStrictEqual({
      flags: [['--test'], ['--import']],
      files: [],
    })
  })
})
