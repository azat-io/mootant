import type { NodeTestCommand } from './types/node-test-command'

import { splitNodeArguments } from './split-node-arguments'

/**
 * Words after a package manager that run a script of the package, not a binary.
 */
const SCRIPT_WORDS = new Set(['run-script', 'test', 'run', 't'])

/**
 * Options of better-node-test that take a value: `-t` becomes a name pattern,
 * the coverage ones are left out.
 */
const BNT_VALUES = new Set([
  '--coverage-include',
  '--coverage-exclude',
  '--coverage',
  '-t',
])

/**
 * Options of borp that take a value and change nothing mootant runs.
 */
const BORP_VALUES = new Set([
  '--coverage-exclude',
  '--post-compile',
  '--concurrency',
  '--reporter',
  '--ignore',
  '-X',
  '-P',
  '-c',
  '-r',
  '-i',
])

/**
 * Reads the test command of one simple command of a script (`parseCommand`):
 * leading `NAME=value` words and `env` or `cross-env` set variables; `pnpm`,
 * `pnpm exec`, `npx`, `npm exec`, `yarn` and `yarn exec` run the binary that
 * follows; the binary is `node` with `--test`, `tsx` with `--test` (Node with
 * `--import tsx`; its `--tsconfig` becomes `TSX_TSCONFIG_PATH`),
 * better-node-test (`bnt`: `NODE_ENV=test`, `-t` as a name pattern, coverage
 * options left out) or borp (`--pattern`, `--timeout`, `--only` and
 * `--expose-gc` kept, its other options left out). A command that runs a script
 * of the package, or anything else, gives null.
 *
 * @param words - Words of the simple command.
 * @returns The test command, or null when the words do not run node:test.
 */
export function resolveCommand(
  words: readonly string[],
): NodeTestCommand | null {
  let environment: Record<string, string> = {}
  let rest = [...words]
  let binary: undefined | string
  while ((binary = rest.shift()) !== undefined) {
    let assignment = /^(?<name>[A-Z_a-z]\w*)=(?<value>.*)$/su.exec(binary)
    if (assignment !== null) {
      environment[assignment.groups!['name']!] = assignment.groups!['value']!
    } else if (['cross-env', 'env', 'npx'].includes(binary)) {
      while (rest[0]?.startsWith('-')) {
        rest.shift()
      }
    } else if (['pnpm', 'yarn', 'npm'].includes(binary)) {
      let word = rest[0] ?? 'run'
      if (word === 'exec' || (binary === 'npm' && word === 'x')) {
        rest.shift()
        if (rest[0] === '--') {
          rest.shift()
        }
      } else if (binary === 'npm' || SCRIPT_WORDS.has(word)) {
        return null
      }
    } else {
      break
    }
  }
  if (binary === undefined) {
    return null
  }
  let name = binary
    .split(/[/\\]/u)
    .at(-1)!
    .replace(/\.(?:cmd|exe)$/iu, '')
  if (name === 'node' || name === 'tsx') {
    return readNode(name, rest, environment)
  }
  if (name === 'bnt' || name === 'better-node-test') {
    return readBnt(rest, environment)
  }
  return name === 'borp' ? readBorp(rest, environment) : null
}

/**
 * Reads the words after borp.
 *
 * @param words - Words after the binary.
 * @param environment - Variables the command sets.
 * @returns The command.
 */
function readBorp(
  words: string[],
  environment: Record<string, string>,
): NodeTestCommand {
  let flags: string[][] = []
  let files: string[] = []
  for (let index = 0; index < words.length; index++) {
    let word = words[index]!
    switch (word) {
      case '--expose-gc': {
        flags.push(['--expose-gc'])
        break
      }
      case '--pattern':
      case '-p': {
        index += 1
        files.push(words[index] ?? '')
        break
      }
      case '--timeout':
      case '-t': {
        index += 1
        flags.push(['--test-timeout', words[index] ?? ''])
        break
      }
      case '--only':
      case '-o': {
        flags.push(['--test-only'])
        break
      }
      default:
        if (BORP_VALUES.has(word)) {
          index += 1
        } else if (!word.startsWith('-')) {
          files.push(word)
        }
    }
  }
  return { env: environment, tool: 'borp', flags, files }
}

/**
 * Reads the words after `node` or `tsx`, which run node:test only with
 * `--test`.
 *
 * @param tool - `node` or `tsx`.
 * @param words - Words after the binary.
 * @param environment - Variables the command sets, filled here.
 * @returns The command, or null without `--test`.
 */
function readNode(
  tool: 'node' | 'tsx',
  words: string[],
  environment: Record<string, string>,
): NodeTestCommand | null {
  let rest = words
  if (tool === 'tsx') {
    rest = []
    for (let index = 0; index < words.length; index++) {
      if (words[index] === '--tsconfig') {
        index += 1
        environment['TSX_TSCONFIG_PATH'] = words[index] ?? ''
      } else if (words[index]!.startsWith('--tsconfig=')) {
        environment['TSX_TSCONFIG_PATH'] = words[index]!.slice(11)
      } else {
        rest.push(words[index]!)
      }
    }
  }
  let { flags, files } = splitNodeArguments(rest)
  if (flags.every(([flag]) => flag !== '--test')) {
    return null
  }
  return {
    flags: tool === 'tsx' ? [['--import', 'tsx'], ...flags] : flags,
    env: environment,
    files,
    tool,
  }
}

/**
 * Reads the words after better-node-test.
 *
 * @param words - Words after the binary.
 * @param environment - Variables the command sets.
 * @returns The command, or null for its help.
 */
function readBnt(
  words: string[],
  environment: Record<string, string>,
): NodeTestCommand | null {
  let flags: string[][] = []
  let files: string[] = []
  for (let index = 0; index < words.length; index++) {
    let word = words[index]!
    if (word === '--help' || word === '-h') {
      return null
    }
    if (BNT_VALUES.has(word)) {
      index += 1
      if (word === '-t') {
        flags.push([`--test-name-pattern=${words[index] ?? ''}`])
      }
    } else if (word !== '--debug') {
      files.push(word)
    }
  }
  return {
    env: { ...environment, NODE_ENV: 'test' },
    tool: 'bnt',
    flags,
    files,
  }
}
