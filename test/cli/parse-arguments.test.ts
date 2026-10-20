import { afterEach, describe, expect, it } from 'vitest'

import { parseArguments } from '../../cli/parse-arguments'

/**
 * Help text the CLI prints, pinned line by line.
 */
const HELP_TEXT = [
  'Usage:',
  '  $ mootant <command> [options]',
  '',
  'Commands:',
  '  list <paths...>      List the mutants of files and directories',
  '  run [paths...]       Run the tests against the mutants of files and',
  '                       directories (default: run.paths of the configuration)',
  '',
  'Options:',
  '  --config <path>      Configuration file (default: searched from the current',
  '                       directory up: mootant.config.{js,ts,...}, .mootantrc or',
  '                       the "mootant" key of package.json)',
  '  --preset <name>      Mutator preset: recommended, strict or a plugin preset;',
  '                       replaces the presets of the configuration',
  '                       (default: recommended)',
  '  --since <ref>        Only mutants on lines changed since the merge base of',
  '                       <ref> and HEAD, uncommitted changes and untracked files',
  '                       included',
  '  --json               Print the report as JSON; for run, only the mutants to',
  '                       act on (survived, no coverage, error), each with its',
  '                       likeliest test files and one covering test',
  '  --all                run: with --json, list every mutant',
  '  --no-color           Print without colors (also NO_COLOR=1); --color forces',
  '                       them',
  '  --skipped            list: also list the mutants that were considered and',
  '                       skipped, with the reason; code that is never mutated,',
  '                       such as types, decorators and enums, is not listed',
  '  --threshold <score>  run: lowest mutation score from 0 to 100 that passes;',
  '                       below it the exit code is 1',
  '  --concurrency <n>    run: most test files at once (default: CPU cores - 1)',
  '  --fast               run: try many mutants in one test run; faster, but a',
  '                       kill may be false (state left by earlier tries)',
  '  --no-cache           run: run every mutant again instead of reusing the',
  '                       verdicts of earlier runs',
  '  --mutant <id>        run: run only this mutant, by its id or a unique prefix',
  '                       of 4 characters or more, as reports print it; repeat',
  '                       for more',
  '  --verbose            With --json, print the full report (offsets, original',
  '                       and replacement texts, every covering test, timings);',
  '                       run: show what the tests print, the covering test of',
  '                       each survivor and the runs of the test runner',
  '  -h, --help           Display this message',
  '  -v, --version        Display version number',
].join('\n')

/**
 * Real descriptors of the runtime facts the version line reports, restored
 * after every test.
 */
let realRuntime = {
  platform: Object.getOwnPropertyDescriptor(process, 'platform')!,
  version: Object.getOwnPropertyDescriptor(process, 'version')!,
  arch: Object.getOwnPropertyDescriptor(process, 'arch')!,
}

describe('parseArguments', () => {
  afterEach(() => {
    Object.defineProperties(process, realRuntime)
  })

  it('returns the help text when no arguments are passed', () => {
    let result = parseArguments([], '1.0.0')

    expect(result).toStrictEqual({ text: HELP_TEXT, kind: 'help' })
  })

  it.each([
    { argv: ['--help'], given: '--help' },
    { argv: ['-h'], given: '-h' },
    { argv: ['list', 'src', '--help'], given: 'a command with --help' },
    { given: 'options without a command', argv: ['--json'] },
  ])('returns the help text for $given', ({ argv }) => {
    let result = parseArguments(argv, '1.0.0')

    expect(result).toStrictEqual({ text: HELP_TEXT, kind: 'help' })
  })

  it.each(['--version', '-v'])('returns the version line for %s', flag => {
    Object.defineProperties(process, {
      version: { value: 'v24.11.0' },
      platform: { value: 'linux' },
      arch: { value: 'x64' },
    })

    let result = parseArguments([flag], '1.2.3')

    expect(result).toStrictEqual({
      text: 'mootant/1.2.3 linux-x64 node-v24.11.0',
      kind: 'version',
    })
  })

  it.each([
    { argv: ['--version', '--help'], given: 'both flags' },
    { given: 'grouped short flags', argv: ['-vh'] },
  ])('prefers the help text over the version line for $given', ({ argv }) => {
    let result = parseArguments(argv, '1.0.0')

    expect(result).toStrictEqual({ text: HELP_TEXT, kind: 'help' })
  })

  it('returns list options with defaults', () => {
    let result = parseArguments(['list', 'src', 'lib/a.ts'], '1.0.0')

    expect(result).toStrictEqual({
      options: {
        paths: ['src', 'lib/a.ts'],
        verbose: false,
        skipped: false,
        json: false,
      },
      kind: 'list',
    })
  })

  it('reads --json, --skipped, --preset, --config and --verbose wherever they appear', () => {
    let result = parseArguments(
      [
        '--json',
        'list',
        '--preset',
        'strict',
        'src',
        '--skipped',
        '--config',
        'mootant.config.ts',
        '--verbose',
      ],
      '1.0.0',
    )

    expect(result).toStrictEqual({
      options: {
        config: 'mootant.config.ts',
        preset: 'strict',
        paths: ['src'],
        verbose: true,
        skipped: true,
        json: true,
      },
      kind: 'list',
    })
  })

  it('treats every argument after -- as a path', () => {
    let result = parseArguments(['list', '--', '--json', 'src'], '1.0.0')

    expect(result).toStrictEqual({
      options: {
        paths: ['--json', 'src'],
        verbose: false,
        skipped: false,
        json: false,
      },
      kind: 'list',
    })
  })

  it.each([
    {
      expected: "'mootant list src'",
      given: 'list without paths',
      argv: ['list'],
    },
    {
      argv: ['list', 'src', '--preset'],
      given: 'a missing preset name',
      expected: "'--preset <value>'",
    },
  ])('returns an error for $given', ({ expected, argv }) => {
    let result = parseArguments(argv, '1.0.0')

    expect(result).toStrictEqual({
      message: expect.stringContaining(expected) as string,
      kind: 'error',
    })
  })

  it('returns run options with defaults and no paths', () => {
    let result = parseArguments(['run'], '1.0.0')

    expect(result).toStrictEqual({
      options: {
        verbose: false,
        mutantIds: [],
        json: false,
        all: false,
        paths: [],
      },
      kind: 'run',
    })
  })

  it('reads every run option', () => {
    let result = parseArguments(
      [
        'run',
        'src',
        '--threshold',
        '72.5',
        '--concurrency',
        '3',
        '--fast',
        '--no-cache',
        '--since',
        'main',
        '--mutant',
        'k3m9x2p7q4w8',
        '--mutant',
        'v7m5k6j2r8s4',
        '--json',
        '--preset',
        'strict',
        '--config',
        'mootant.config.ts',
        '--verbose',
        '--no-color',
        '--all',
      ],
      '1.0.0',
    )

    expect(result).toStrictEqual({
      options: {
        mutantIds: ['k3m9x2p7q4w8', 'v7m5k6j2r8s4'],
        config: 'mootant.config.ts',
        preset: 'strict',
        threshold: 72.5,
        concurrency: 3,
        paths: ['src'],
        verbose: true,
        since: 'main',
        cache: false,
        fast: true,
        json: true,
        all: true,
      },
      kind: 'run',
    })
  })

  it('reads --since for list', () => {
    expect(
      parseArguments(['list', 'src', '--since', 'origin/main'], '1.0.0'),
    ).toStrictEqual({
      options: {
        since: 'origin/main',
        paths: ['src'],
        verbose: false,
        skipped: false,
        json: false,
      },
      kind: 'list',
    })
  })

  it('reads --cache, which forces the cache on', () => {
    expect(parseArguments(['run', '--cache'], '1.0.0')).toMatchObject({
      options: { cache: true },
      kind: 'run',
    })
  })

  it.each(['0', '100', '0.5'])('accepts the threshold %s', threshold => {
    let result = parseArguments(['run', '--threshold', threshold], '1.0.0')

    expect(result).toMatchObject({
      options: { threshold: Number(threshold) },
      kind: 'run',
    })
  })

  it.each([
    {
      message: '--threshold expects a number from 0 to 100.',
      argv: ['run', '--threshold', '101'],
    },
    {
      message: '--threshold expects a number from 0 to 100.',
      argv: ['run', '--threshold=-1'],
    },
    {
      message: '--threshold expects a number from 0 to 100.',
      argv: ['run', '--threshold', 'high'],
    },
    {
      message: '--threshold expects a number from 0 to 100.',
      argv: ['run', '--threshold', ' '],
    },
    {
      message: '--concurrency expects a positive integer.',
      argv: ['run', '--concurrency', '0'],
    },
    {
      message: '--concurrency expects a positive integer.',
      argv: ['run', '--concurrency', '1.5'],
    },
    {
      message: '--skipped applies to the list command only.',
      argv: ['run', 'src', '--skipped'],
    },
    {
      message: '--threshold applies to the run command only.',
      argv: ['list', 'src', '--threshold', '50'],
    },
    {
      message: '--fast applies to the run command only.',
      argv: ['list', 'src', '--fast'],
    },
    {
      message: '--cache applies to the run command only.',
      argv: ['list', 'src', '--no-cache'],
    },
    {
      message: '--verbose applies to the JSON report of list only; add --json.',
      argv: ['list', 'src', '--verbose'],
    },
    {
      message: '--mutant applies to the run command only.',
      argv: ['list', 'src', '--mutant', 'k3m9x2p7q4w8'],
    },
    {
      message: '--all applies to the run command only.',
      argv: ['list', 'src', '--json', '--all'],
    },
    {
      message: '--all applies to the JSON report only; add --json.',
      argv: ['run', 'src', '--all'],
    },
    {
      message: '--since expects a git revision, such as --since main.',
      argv: ['run', 'src', '--since='],
    },
    {
      message: '--since expects a git revision, such as --since main.',
      argv: ['list', 'src', '--since=-p'],
    },
  ])('returns "$message" for $argv', ({ message, argv }) => {
    let result = parseArguments(argv, '1.0.0')

    expect(result).toStrictEqual({ kind: 'error', message })
  })

  it('returns an error naming an unknown option', () => {
    let result = parseArguments(['--bogus'], '1.0.0')

    expect(result).toStrictEqual({
      message: expect.stringContaining("'--bogus'") as string,
      kind: 'error',
    })
  })

  it('returns an error naming an unknown command', () => {
    let result = parseArguments(['somewhere'], '1.0.0')

    expect(result).toStrictEqual({
      message: expect.stringContaining("'somewhere'") as string,
      kind: 'error',
    })
  })
})
