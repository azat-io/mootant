import { describe, expect, it } from 'vitest'

import { filterJestArguments } from '../../../adapters/jest/filter-jest-arguments'

describe('filterJestArguments', () => {
  it.each([
    ['a boolean flag', ['--coverage', 'a'], ['a']],
    ['a boolean flag with its value after =', ['--coverage=false', 'a'], ['a']],
    ['a boolean flag with true after it', ['--coverage', 'true', 'a'], ['a']],
    ['a boolean flag with false after it', ['--coverage', 'false', 'a'], ['a']],
    ['a boolean flag with = leaves true', ['--ci=false', 'true'], ['true']],
    ['a value flag with its value after =', ['--outputFile=x', 'a'], ['a']],
    ['a value flag with its value after it', ['--outputFile', 'x', 'a'], ['a']],
    ['a value flag before a flag', ['--outputFile', '-i'], ['-i']],
    ['a value flag at the end', ['--outputFile'], []],
    [
      'a value flag with a negative number after it',
      ['--openHandlesTimeout', '-1', 'a'],
      ['a'],
    ],
    ['a value flag with - after it', ['--outputFile', '-'], []],
    [
      'an array flag up to the next flag',
      ['--reporters', 'x', 'y', '-i'],
      ['-i'],
    ],
    ['an array flag after =', ['--reporters=x', 'y', '-i', 'a'], ['-i', 'a']],
    ['an array flag at the end', ['--reporters', 'x'], []],
    [
      'an array flag with a negative number in it',
      ['--reporters', '-1', 'x', '-i'],
      ['-i'],
    ],
    [
      'a string flag people take for a list',
      ['--collectCoverageFrom', 'x', 'a'],
      ['a'],
    ],
    [
      'a kebab-case name',
      ['--update-snapshot', '--coverage-directory', 'x'],
      [],
    ],
    ['a negated boolean flag', ['--no-coverage', '--no-update-snapshot'], []],
    ['a negated flag, not the word after it', ['--no-ci', 'true'], ['true']],
    ['a negated value flag', ['--no-outputFile', 'x'], ['x']],
    ['a negated flag mootant gives itself', ['--no-testResultsProcessor'], []],
    ['a negated flag it would refuse in a config', ['--no-changedSince'], []],
    ['a letter with two dashes', ['--u', '--b', 'a'], ['a']],
    ['--bail', ['--bail', 'a'], ['a']],
    ['--bail with a number after it', ['--bail', '3', 'a'], ['a']],
    ['--bail with a number after =', ['--bail=3', 'a'], ['a']],
    ['--bail with true after it', ['--bail', 'true', 'a'], ['a']],
    ['-b with a number after it', ['-b', '3', 'a'], ['a']],
    ['--no-bail', ['--no-bail', 'a'], ['a']],
    ['the dropped letters of a bundle', ['-iu'], ['-i']],
    ['a bundle of dropped letters', ['-eo'], []],
    ['a bundle with the value of its last letter', ['-eb', '3'], []],
    ['a value letter of a bundle that is not last', ['-tu', 'a'], ['a']],
    ['the empty config of a bundle', ['-cu', 'x.js'], ['x.js']],
    ['a bundle of a value letter and dropped ones', ['-tue'], []],
    ['a bundle that starts with the config', ['-co'], []],
    [
      'a bundle that ends in a kept letter with a value',
      ['-uw', '4'],
      ['-w', '4'],
    ],
  ])('drops %s', (_, arguments_, kept) => {
    expect(filterJestArguments(arguments_, null).args).toStrictEqual(kept)
  })

  it.each([
    ['positionals', ['a', 'b']],
    ['a kept boolean flag', ['--runInBand', '-i']],
    [
      'what makes Jest run one file at a time',
      ['--detectOpenHandles', '--no-detect-open-handles'],
    ],
    [
      'what picks the console of tests',
      ['--silent', '--verbose', 'false', '--no-silent', 'a'],
    ],
    [
      'what picks where a console that writes at once writes',
      ['--useStderr', '--use-stderr', 'false', 'a'],
    ],
    ['a kept flag in kebab case', ['--test-timeout=5', '--run-in-band']],
    ['a kept flag with a value', ['--maxWorkers=2', '-w', '4', '-c', 'x.js']],
    ['the seed', ['--seed=5']],
    ['a bundle without a dropped letter', ['-ic']],
    ['a bundle with an unknown letter', ['-iux']],
    ['a short flag with its value in the word', ['-w4', '-table', '-b3']],
    ['a flag Jest does not have', ['--constructor', '--no-such', '-']],
    ['a negated kept flag', ['--no-config', 'x', '--no-watchman', 'false']],
    ['a kept letter with two dashes', ['--t', 'x', '--w', '2']],
    ['a negative number', ['-1']],
    ['-- and what follows', ['-i', '--', '--coverage', 'a']],
  ])('keeps %s as written', (_, arguments_) => {
    expect(filterJestArguments(arguments_, null).args).toStrictEqual(arguments_)
  })

  it.each([
    [
      'an array flag',
      ['--testPathIgnorePatterns', 'e2e', '--coverage', 'a'],
      ['--testPathIgnorePatterns', 'e2e', '--ci=true', 'a'],
    ],
    [
      'an array flag after =',
      ['--roots=x', '--ci', 'a'],
      ['--roots=x', '--ci=true', 'a'],
    ],
    [
      'a boolean flag',
      ['--runInBand', '--outputFile=x', 'false'],
      ['--runInBand', '--ci=true', 'false'],
    ],
  ])(
    'keeps a positional after a dropped flag apart from %s',
    (_, arguments_, kept) => {
      expect(filterJestArguments(arguments_, null).args).toStrictEqual(kept)
    },
  )

  it.each([
    [
      ['--roots', 'x', '--coverage', '--', 'a'],
      ['--roots', 'x', '--', 'a'],
    ],
    [
      ['--roots', 'x', '--coverage', '-i', 'a'],
      ['--roots', 'x', '-i', 'a'],
    ],
    [
      ['--roots', 'x', '--coverage'],
      ['--roots', 'x'],
    ],
    [['--coverage', 'a'], ['a']],
  ])('adds no flag to %j, where no word can go astray', (arguments_, kept) => {
    expect(filterJestArguments(arguments_, null).args).toStrictEqual(kept)
  })

  it.each([
    [
      ['--json', 'a'],
      ['a', '--useStderr'],
    ],
    [
      ['--json=true', '--roots', 'x', '--', 'b'],
      ['--roots', 'x', '--useStderr', '--', 'b'],
    ],
    [['--json', 'false', 'a'], ['a']],
    [['--json=false'], []],
    [['--json', '--no-json'], []],
  ])(
    'gives %j as %j, since Jest sends a console that writes at once to standard error for --json',
    (arguments_, kept) => {
      expect(filterJestArguments(arguments_, null).args).toStrictEqual(kept)
    },
  )

  it.each([
    ['positionals on both sides', ['a', '--findRelatedTests', 'b'], []],
    ['the words after --', ['--findRelatedTests', 'a', '--', 'b'], []],
    ['a positional after =true', ['--findRelatedTests=true', 'a'], []],
    ['a positional after true', ['--findRelatedTests', 'true', 'a'], []],
    ['a negative number', ['--findRelatedTests', '-1'], []],
    [
      'no word a kept boolean takes',
      ['--findRelatedTests', '--passWithNoTests', 'false', 'a'],
      ['--passWithNoTests', 'false'],
    ],
    [
      'no word a kept bundle gives its last letter',
      ['--findRelatedTests', '-ic', 'x.js', 'a'],
      ['-ic', 'x.js'],
    ],
    [
      'no word of a kept letter with two dashes',
      ['--findRelatedTests', '--c', 'x.js', 'a'],
      ['--c', 'x.js'],
    ],
    [
      'the word after a negated kept flag',
      ['--findRelatedTests', '--no-watchman', 'false'],
      ['--no-watchman'],
    ],
    [
      'no value of a kept flag',
      [
        '--findRelatedTests',
        '--config',
        'x.js',
        'a',
        '-t',
        'name',
        '--testMatch',
        'x',
        'y',
        '--testTimeout=5',
        'b',
      ],
      [
        '--config',
        'x.js',
        '-t',
        'name',
        '--testMatch',
        'x',
        'y',
        '--testTimeout=5',
      ],
    ],
  ])('--findRelatedTests drops %s', (_, arguments_, kept) => {
    expect(filterJestArguments(arguments_, null).args).toStrictEqual(kept)
  })

  it.each([
    [['--findRelatedTests=false', 'a'], ['a']],
    [['--findRelatedTests=x', 'a'], ['a']],
    [['--findRelatedTests', 'false', 'a'], ['a']],
    [['--no-findRelatedTests', 'a'], ['a']],
    [['--no-find-related-tests', 'a'], ['a']],
    [['--findRelatedTests', '--no-findRelatedTests', 'a'], ['a']],
    [
      ['findRelatedTests', 'a'],
      ['findRelatedTests', 'a'],
    ],
    [
      ['-t', 'findRelatedTests', 'a'],
      ['-t', 'findRelatedTests', 'a'],
    ],
  ])(
    'keeps the positionals of %j, where Jest reads no such flag as true',
    (arguments_, kept) => {
      expect(filterJestArguments(arguments_, null).args).toStrictEqual(kept)
    },
  )

  it('warns about what asks for what mootant does not do', () => {
    let { diagnostics } = filterJestArguments(
      [
        '--watch',
        '--no-watch-all',
        '--bail=3',
        '--changedSince',
        'main',
        '--listTests',
        '-bo',
        '--findRelatedTests',
      ],
      null,
    )

    expect(diagnostics.map(diagnostic => diagnostic.message)).toStrictEqual([
      'mootant ignores --watch of the test command.',
      'mootant ignores --no-watch-all of the test command.',
      'mootant ignores --bail of the test command.',
      'mootant ignores --changedSince of the test command.',
      'mootant ignores --listTests of the test command.',
      'mootant ignores -b of the test command.',
      'mootant ignores -o of the test command.',
      'mootant ignores --findRelatedTests of the test command.',
    ])
    expect(diagnostics[0]).toStrictEqual({
      message: 'mootant ignores --watch of the test command.',
      code: 'config-overridden',
      severity: 'warning',
      column: null,
      line: null,
      file: null,
    })
  })

  it('says why it ignores a snapshot update', () => {
    let { diagnostics } = filterJestArguments(
      ['-iu', '--updateSnapshot', '--u'],
      null,
    )

    expect(diagnostics.map(diagnostic => diagnostic.message)).toStrictEqual([
      'mootant never writes snapshots, so it ignores -u of the test command.',
      'mootant never writes snapshots, so it ignores --updateSnapshot of the test command.',
      'mootant never writes snapshots, so it ignores --u of the test command.',
    ])
  })

  it('does not warn about what only changes reports and files', () => {
    expect(
      filterJestArguments(
        ['--coverage', '--ci', '--json', '--no-cache', '-e'],
        null,
      ).diagnostics,
    ).toStrictEqual([])
  })

  it.each([
    [['--runner=x']],
    [['--runner', 'x']],
    [['-i', '--runner']],
    [['--no-runner']],
  ])('refuses %j', arguments_ => {
    expect(() => filterJestArguments(arguments_, null)).toThrow(
      'mootant gives Jest its own runner, and Jest fails on a second one; remove --runner from the test command.',
    )
  })

  it('reads --runner after -- as a positional', () => {
    expect(filterJestArguments(['--', '--runner'], null).args).toStrictEqual([
      '--',
      '--runner',
    ])
  })

  it.each<[string, string[], string | null]>([
    ['-i', ['-i'], '-i'],
    ['-i with two dashes', ['--i'], '--i'],
    ['--runInBand', ['--runInBand'], '--runInBand'],
    ['--runInBand in kebab case', ['--run-in-band'], '--run-in-band'],
    ['--runInBand=true', ['--runInBand=true'], '--runInBand'],
    ['--runInBand with true after it', ['--runInBand', 'true'], '--runInBand'],
    ['--runInBand=false', ['--runInBand=false'], null],
    ['--runInBand with false after it', ['--runInBand', 'false'], null],
    ['--no-runInBand', ['--no-runInBand'], null],
    ['its last mention', ['-i', '--no-runInBand'], null],
    ['-i after --', ['--', '-i'], null],
    ['no such flag', ['--coverage'], null],
  ])(
    'reads %s for what keeps test files from running at once',
    (_, arguments_, serial) => {
      expect(filterJestArguments(arguments_, 2).serial).toBe(serial)
      expect(filterJestArguments(arguments_, null).serial).toBe(serial)
    },
  )

  it('reads -i out of a bundle that a concurrency splits', () => {
    expect(filterJestArguments(['-ic', 'x.js'], 2).serial).toBe('-i')
  })

  describe('with a concurrency', () => {
    it.each([
      ['--maxWorkers with its value after =', ['--maxWorkers=4', 'a'], ['a']],
      [
        '--maxWorkers with its value after it',
        ['--maxWorkers', '4', 'a'],
        ['a'],
      ],
      ['--maxWorkers in kebab case', ['--max-workers=4', 'a'], ['a']],
      ['-w with its value after it', ['-w', '4', 'a'], ['a']],
      ['-w with its value after =', ['-w=4', 'a'], ['a']],
      ['-w with its value in the word', ['-w4', 'a'], ['a']],
      ['-w with two dashes', ['--w=4', 'a'], ['a']],
      ['-i', ['-i', 'a'], ['a']],
      ['-i with two dashes', ['--i', 'a'], ['a']],
      ['--runInBand', ['--runInBand', 'a'], ['a']],
      [
        '--runInBand with a value after it',
        ['--runInBand', 'true', 'a'],
        ['a'],
      ],
      ['--run-in-band', ['--run-in-band', 'a'], ['a']],
      ['--no-runInBand', ['--no-runInBand', 'a'], ['a']],
      ['-i out of a bundle', ['-ic', 'x.js'], ['-c', 'x.js']],
      ['-w out of a bundle', ['-iw', '4', 'a'], ['a']],
    ])('drops %s', (_, arguments_, kept) => {
      expect(filterJestArguments(arguments_, 2).args).toStrictEqual(kept)
    })

    it('keeps a positional after them apart from the flag before them', () => {
      expect(
        filterJestArguments(['--roots', 'x', '--maxWorkers=4', 'a'], 2).args,
      ).toStrictEqual(['--roots', 'x', '--ci=true', 'a'])
    })

    it('warns of none of them itself', () => {
      expect(
        filterJestArguments(['-i', '--maxWorkers=4', '-w4'], 2).diagnostics,
      ).toStrictEqual([])
    })

    it('keeps --detectOpenHandles, which the resolved configuration tells', () => {
      expect(
        filterJestArguments(['--detectOpenHandles', 'a'], 2).args,
      ).toStrictEqual(['--detectOpenHandles', 'a'])
    })

    it('leaves other short flags with a value in the word and what follows -- alone', () => {
      expect(
        filterJestArguments(['-t4', '--', '-i', '--maxWorkers=4'], 2).args,
      ).toStrictEqual(['-t4', '--', '-i', '--maxWorkers=4'])
    })

    it('still drops what it drops with no concurrency', () => {
      expect(filterJestArguments(['--coverage', '-iu'], 2).args).toStrictEqual(
        [],
      )
    })
  })
})
