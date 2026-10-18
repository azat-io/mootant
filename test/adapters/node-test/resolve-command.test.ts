import { describe, expect, it } from 'vitest'

import { resolveCommand } from '../../../adapters/node-test/resolve-command'
import { parseCommand } from '../../../adapters/node-test/parse-command'

/**
 * Resolves the first simple command of a command line.
 *
 * @param text - Command line.
 * @returns What `resolveCommand` gives.
 */
function resolve(text: string): ReturnType<typeof resolveCommand> {
  return resolveCommand(parseCommand(text)[0] ?? [])
}

describe('resolveCommand', () => {
  it('reads node with --test, its flags, files and variables', () => {
    expect(
      resolve(
        `A=1 cross-env --silent B=2 env C=3 node --import tsx --test 'test/**/*.test.ts'`,
      ),
    ).toStrictEqual({
      flags: [['--import', 'tsx'], ['--test']],
      env: { A: '1', B: '2', C: '3' },
      files: ['test/**/*.test.ts'],
      tool: 'node',
    })
    expect(resolve('/usr/local/bin/node.exe --test')).toMatchObject({
      tool: 'node',
    })
  })

  it('reads binaries behind package managers', () => {
    for (let text of [
      'pnpm node --test',
      'pnpm exec node --test',
      'npx --yes node --test',
      'npm exec -- node --test',
      'npm x node --test',
      'yarn exec node --test',
      'yarn node --test',
    ]) {
      expect(resolve(text)).toMatchObject({ tool: 'node' })
    }
  })

  it('ignores scripts of the package and other commands', () => {
    for (let text of [
      'pnpm run test:unit',
      'pnpm test',
      'npm run x',
      'npm test',
      'yarn',
      'node test/size.js',
      'vitest run',
      'A=1',
      'bnt --help',
      'better-node-test -h',
    ]) {
      expect(resolve(text)).toBeNull()
    }
  })

  it('reads tsx with --test as Node with tsx', () => {
    expect(
      resolve('tsx --tsconfig tsconfig.test.json --test --test-only a.ts'),
    ).toStrictEqual({
      flags: [['--import', 'tsx'], ['--test'], ['--test-only']],
      env: { TSX_TSCONFIG_PATH: 'tsconfig.test.json' },
      files: ['a.ts'],
      tool: 'tsx',
    })
    expect(resolve('tsx --tsconfig=b.json --test')).toMatchObject({
      env: { TSX_TSCONFIG_PATH: 'b.json' },
    })
    expect(resolve('tsx --tsconfig')).toBeNull()
    expect(resolve('tsx a.ts')).toBeNull()
  })

  it('reads better-node-test with coverage and a name pattern', () => {
    expect(
      resolve(
        "pnpm bnt --coverage 100 --coverage-exclude '**/*.test.ts' --coverage-include src --debug -t 'some name' a.test.ts",
      ),
    ).toStrictEqual({
      flags: [['--test-name-pattern=some name']],
      env: { NODE_ENV: 'test' },
      files: ['a.test.ts'],
      tool: 'bnt',
    })
    expect(resolve('better-node-test -t')).toMatchObject({
      flags: [['--test-name-pattern=']],
    })
  })

  it('reads borp', () => {
    expect(
      resolve(
        'borp --pattern "test/*.test.js" -p x -t 500 --timeout 600 -o --only --expose-gc -c 2 --reporter spec -C --coverage-exclude y z.test.js',
      ),
    ).toStrictEqual({
      flags: [
        ['--test-timeout', '500'],
        ['--test-timeout', '600'],
        ['--test-only'],
        ['--test-only'],
        ['--expose-gc'],
      ],
      files: ['test/*.test.js', 'x', 'z.test.js'],
      tool: 'borp',
      env: {},
    })
    expect(resolve('borp -p')).toMatchObject({ files: [''] })
    expect(resolve('borp -t')).toMatchObject({
      flags: [['--test-timeout', '']],
    })
  })
})
