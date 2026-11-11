import { describe, expect, it } from 'vitest'

import { readCommandPrefix } from '../../../adapters/shared/read-command-prefix'

describe('readCommandPrefix', () => {
  it('reads the variables, the binary and the words after it', () => {
    let words = [
      'A=1',
      'cross-env',
      '--silent',
      'B=2',
      'env',
      'C=x=y',
      'jest',
      '--ci',
      'a.test.js',
    ]

    expect(readCommandPrefix(words)).toStrictEqual({
      environment: { C: 'x=y', A: '1', B: '2' },
      rest: ['--ci', 'a.test.js'],
      name: 'jest',
    })
    expect(words).toHaveLength(9)
  })

  it('reads an empty value as a variable', () => {
    expect(readCommandPrefix(['A=', 'jest'])).toStrictEqual({
      environment: { A: '' },
      name: 'jest',
      rest: [],
    })
  })

  it('takes a word whose name starts with a digit as the binary', () => {
    expect(readCommandPrefix(['1A=x', 'jest'])).toStrictEqual({
      environment: {},
      rest: ['jest'],
      name: '1A=x',
    })
  })

  it('reads the binary behind a package manager', () => {
    for (let words of [
      ['pnpm', 'jest', '--ci'],
      ['pnpm', 'exec', 'jest', '--ci'],
      ['pnpm', 'exec', '--', 'jest', '--ci'],
      ['npx', '--yes', '-q', 'jest', '--ci'],
      ['npm', 'exec', '--', 'jest', '--ci'],
      ['npm', 'exec', 'jest', '--ci'],
      ['npm', 'x', 'jest', '--ci'],
      ['yarn', 'exec', 'jest', '--ci'],
      ['yarn', 'jest', '--ci'],
    ]) {
      expect(readCommandPrefix(words)).toStrictEqual({
        environment: {},
        rest: ['--ci'],
        name: 'jest',
      })
    }
  })

  it('takes x as the binary behind pnpm, where only npm has that shorthand', () => {
    expect(readCommandPrefix(['pnpm', 'x', 'jest'])).toStrictEqual({
      environment: {},
      rest: ['jest'],
      name: 'x',
    })
  })

  it('gives the base name of the binary without .cmd or .exe', () => {
    for (let [binary, name] of [
      ['node_modules/.bin/jest', 'jest'],
      ['/usr/local/bin/node.exe', 'node'],
      [String.raw`node_modules\.bin\jest.CMD`, 'jest'],
      ['tools/run.exe.js', 'run.exe.js'],
    ] as const) {
      expect(readCommandPrefix([binary])).toStrictEqual({
        environment: {},
        rest: [],
        name,
      })
    }
  })

  it('gives null for a script of the package', () => {
    for (let words of [
      ['pnpm', 'run', 'test:unit'],
      ['pnpm', 'run-script', 'x'],
      ['pnpm', 'test'],
      ['pnpm', 't'],
      ['pnpm'],
      ['npm', 'run', 'x'],
      ['npm', 'test'],
      ['npm', 'ci'],
      ['npm'],
      ['yarn', 'run', 'x'],
      ['yarn'],
      ['A=1', 'pnpm', 'test'],
    ]) {
      expect(readCommandPrefix(words)).toBeNull()
    }
  })

  it('gives null for words without a binary', () => {
    for (let words of [
      [],
      ['A=1'],
      ['env'],
      ['cross-env', '--silent', 'A=1'],
      ['npx', '--yes'],
      ['pnpm', 'exec'],
      ['npm', 'exec', '--'],
    ]) {
      expect(readCommandPrefix(words)).toBeNull()
    }
  })
})
