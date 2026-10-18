import { describe, expect, it } from 'vitest'

import { filterExecArgv } from '../../../adapters/node-test/filter-exec-argv'

/**
 * Builds a `config-overridden` warning.
 *
 * @param message - Its sentence.
 * @returns The diagnostic.
 */
function warning(message: string): object {
  return {
    code: 'config-overridden',
    severity: 'warning',
    column: null,
    line: null,
    file: null,
    message,
  }
}

describe('filterExecArgv', () => {
  it('keeps flags a plain process honours and leaves out the others', () => {
    expect(
      filterExecArgv([
        ['--test'],
        ['--import', 'tsx'],
        ['--test-reporter', 'spec'],
        ['--test-reporter-destination=stdout'],
        ['--experimental-test-coverage'],
        ['--test-coverage-lines=100'],
        ['--test-concurrency', '2'],
        ['--test-isolation=process'],
        ['--test-name-pattern=a'],
        ['--experimental-strip-types'],
      ]),
    ).toStrictEqual({
      execArgv: [
        '--import',
        'tsx',
        '--test-name-pattern=a',
        '--experimental-strip-types',
      ],
      diagnostics: [],
    })
  })

  it('warns about flags it ignores or changes', () => {
    expect(
      filterExecArgv([
        ['--watch'],
        ['--watch'],
        ['--test-shard', '1/2'],
        ['--test-update-snapshots'],
        ['--test-isolation=none'],
        ['--experimental-test-isolation', 'none'],
        ['--test-global-setup', 'setup.js'],
      ]),
    ).toStrictEqual({
      diagnostics: [
        warning('mootant ignores --watch of the test command.'),
        warning('mootant ignores --test-shard of the test command.'),
        warning(
          'mootant never writes snapshots, so it ignores --test-update-snapshots of the test command.',
        ),
        warning(
          'mootant runs every test file in a process of its own, so it ignores --test-isolation=none of the test command.',
        ),
        warning(
          'mootant runs every test file in a process of its own, so it ignores --experimental-test-isolation=none of the test command.',
        ),
        warning(
          'The global setup of --test-global-setup runs in every test process under mootant, not once per run.',
        ),
      ],
      execArgv: ['--test-global-setup', 'setup.js'],
    })
  })

  it('pins the seed of random order unless the command gives one', () => {
    expect(filterExecArgv([['--test-randomize']]).execArgv).toStrictEqual([
      '--test-randomize',
      '--test-random-seed=1',
    ])
    expect(
      filterExecArgv([['--test-randomize'], ['--test-random-seed', '5']])
        .execArgv,
    ).toStrictEqual(['--test-randomize', '--test-random-seed', '5'])
  })
})
