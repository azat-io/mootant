import { afterEach, describe, expect, it, vi } from 'vitest'

import { isColorSupported, createColors } from '../../../cli/terminal/colors'

/**
 * A Linux process without color settings whose output is not a terminal, which
 * every case below changes in one or two ways.
 */
const PLAIN_PROCESS = {
  argv: ['node', 'mootant'],
  stdout: { isTTY: false },
  platform: 'linux',
  env: {},
}

describe('isColorSupported', () => {
  afterEach(() => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
  })

  it.each([
    {
      context: { ...PLAIN_PROCESS, stdout: { isTTY: true } },
      description: 'output to a terminal',
    },
    {
      context: { ...PLAIN_PROCESS, env: { CI: 'true' } },
      description: 'CI, even without a terminal',
    },
    {
      context: { ...PLAIN_PROCESS, env: { FORCE_COLOR: '1' } },
      description: 'FORCE_COLOR',
    },
    {
      context: { ...PLAIN_PROCESS, env: { FORCE_COLOR: '0' } },
      description: 'FORCE_COLOR=0, which counts as set',
    },
    {
      context: { ...PLAIN_PROCESS, argv: ['node', 'mootant', '--color'] },
      description: 'the --color flag',
    },
    {
      context: { ...PLAIN_PROCESS, platform: 'win32' },
      description: 'Windows',
    },
    {
      context: {
        ...PLAIN_PROCESS,
        env: { TERM: 'dumb', CI: 'true' },
        stdout: { isTTY: true },
      },
      description: 'CI in a dumb terminal',
    },
    {
      context: {
        ...PLAIN_PROCESS,
        stdout: { isTTY: true },
        env: { NO_COLOR: '' },
      },
      description: 'an empty NO_COLOR, which counts as unset',
    },
  ])('turns colors on for $description', ({ context }) => {
    expect(isColorSupported(context)).toBe(true)
  })

  it.each([
    {
      description: 'output that is neither a terminal nor in CI',
      context: PLAIN_PROCESS,
    },
    {
      context: {
        ...PLAIN_PROCESS,
        stdout: { isTTY: true },
        env: { TERM: 'dumb' },
      },
      description: 'a dumb terminal',
    },
    {
      description: 'an empty FORCE_COLOR, which counts as unset',
      context: { ...PLAIN_PROCESS, env: { FORCE_COLOR: '' } },
    },
    {
      context: {
        ...PLAIN_PROCESS,
        env: { FORCE_COLOR: '1', NO_COLOR: '1', CI: 'true' },
        stdout: { isTTY: true },
        platform: 'win32',
      },
      description: 'NO_COLOR, whatever else says',
    },
    {
      context: {
        ...PLAIN_PROCESS,
        argv: ['node', 'mootant', '--color', '--no-color'],
        env: { FORCE_COLOR: '1' },
      },
      description: 'the --no-color flag, whatever else says',
    },
  ])('turns colors off for $description', ({ context }) => {
    expect(isColorSupported(context)).toBe(false)
  })

  it('checks the current process by default', () => {
    vi.stubEnv('NO_COLOR', '1')

    expect(isColorSupported()).toBe(false)
  })
})

describe('createColors', () => {
  afterEach(() => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
  })

  it.each([
    { expected: '\u{1B}[92mx\u{1B}[39m', name: 'greenBright' },
    { expected: '\u{1B}[1mx\u{1B}[22m', name: 'bold' },
    { expected: '\u{1B}[2mx\u{1B}[22m', name: 'dim' },
    { expected: '\u{1B}[33mx\u{1B}[39m', name: 'yellow' },
    { expected: '\u{1B}[32mx\u{1B}[39m', name: 'green' },
    { expected: '\u{1B}[90mx\u{1B}[39m', name: 'gray' },
    { expected: '\u{1B}[31mx\u{1B}[39m', name: 'red' },
  ] as const)('wraps text in the codes of $name', ({ expected, name }) => {
    expect(createColors(true)[name]('x')).toBe(expected)
  })

  it('opens a color again after every nested color that ends it', () => {
    let { gray, red } = createColors(true)

    expect(gray(`a ${red('b')} c ${red('d')}`)).toBe(
      '\u{1B}[90ma \u{1B}[31mb\u{1B}[90m c \u{1B}[31md\u{1B}[90m\u{1B}[39m',
    )
  })

  it('turns bold and dim back on after a nested style that ends both', () => {
    let { bold, dim } = createColors(true)

    expect(bold(`a ${dim('b')} c`)).toBe(
      '\u{1B}[1ma \u{1B}[2mb\u{1B}[22m\u{1B}[1m c\u{1B}[22m',
    )
    expect(dim(`a ${bold('b')}`)).toBe(
      '\u{1B}[2ma \u{1B}[1mb\u{1B}[22m\u{1B}[2m\u{1B}[22m',
    )
  })

  it('leaves a nested style alone when it ends with another code', () => {
    let { bold, gray } = createColors(true)

    expect(bold(`a ${gray('b')}`)).toBe(
      '\u{1B}[1ma \u{1B}[90mb\u{1B}[39m\u{1B}[22m',
    )
  })

  it('keeps an ending code within the length of the opening one, as picocolors does', () => {
    expect(createColors(true).gray('\u{1B}[39mx')).toBe(
      '\u{1B}[90m\u{1B}[39mx\u{1B}[39m',
    )
  })

  it.each([
    { text: '5', input: 5 },
    { text: 'null', input: null },
    { text: 'undefined', input: undefined },
  ])('prints $input as text', ({ input, text }) => {
    expect(createColors(true).yellow(input)).toBe(`\u{1B}[33m${text}\u{1B}[39m`)
    expect(createColors(false).yellow(input)).toBe(text)
  })

  it('returns the text without codes when colors are off', () => {
    let { bold, gray } = createColors(false)

    expect(bold(`a ${gray('b')}`)).toBe('a b')
  })

  it('colors when the current process supports it by default', () => {
    vi.stubEnv('NO_COLOR', '1')

    expect(createColors().gray('x')).toBe('x')
  })
})
