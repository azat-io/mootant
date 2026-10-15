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
  '  list <paths...>  List the mutants of files and directories',
  '',
  'Options:',
  '  --config <path>  Configuration file (default: searched from the current',
  '                   directory up: mootant.config.{js,ts,...}, .mootantrc or',
  '                   the "mootant" key of package.json)',
  '  --preset <name>  Mutator preset: recommended, strict or a plugin preset;',
  '                   replaces the presets of the configuration',
  '                   (default: recommended)',
  '  --json           Print the list as JSON',
  '  --skipped        Also list the mutants that were considered and skipped,',
  '                   with the reason; code that is never mutated, such as',
  '                   types, decorators and enums, is not listed',
  '  -h, --help       Display this message',
  '  -v, --version    Display version number',
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
        skipped: false,
        json: false,
      },
      kind: 'list',
    })
  })

  it('reads --json, --skipped, --preset and --config wherever they appear', () => {
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
      ],
      '1.0.0',
    )

    expect(result).toStrictEqual({
      options: {
        config: 'mootant.config.ts',
        preset: 'strict',
        paths: ['src'],
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
