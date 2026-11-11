import path from 'node:path'

import { listTsconfigFiles } from '../shared/list-tsconfig-files'
import { TRANSFORM_CONFIG_NAMES } from './transform-config-names'

/**
 * Names of the configuration files Jest looks for by itself, beside
 * `package.json`, in the order of Jest 30, which adds `.mts` and `.cts` to
 * those of Jest 29.
 */
const JEST_CONFIG_NAMES = [
  'jest.config.js',
  'jest.config.ts',
  'jest.config.mjs',
  'jest.config.mts',
  'jest.config.cjs',
  'jest.config.cts',
  'jest.config.json',
]

/**
 * A flag that names the configuration file, with its value after `=` if any.
 */
const CONFIG_FLAG = /^(?:--c|--config|-c)(?:=(?<value>.*))?$/su

/**
 * Lists configuration files that Jest and the transformers read and that the
 * resolved configuration does not name: the configuration file of the command,
 * given by `-c` or `--config` before any `--` unless that holds JSON, else
 * every `jest.config.*` Jest looks for in the root; and in the root and the
 * directory of each project, the files of Babel, swc and Browserslist and the
 * `tsconfig.json` files that may apply there (`listTsconfigFiles`). Missing
 * files are listed too, as creating one changes what Jest or a transformer
 * does.
 *
 * @param input - What to look at.
 * @param input.directories - Absolute directories of the projects.
 * @param input.args - Jest's arguments that stayed after the filter.
 * @param input.root - Real path of the project root, where Jest runs.
 * @returns Absolute paths, each once.
 */
export function listJestConfigFiles(input: {
  directories: readonly string[]
  args: readonly string[]
  root: string
}): string[] {
  let { root } = input
  let end = input.args.indexOf('--')
  let words = end === -1 ? input.args : input.args.slice(0, end)
  let given: string | null = null
  for (let [index, word] of words.entries()) {
    let match = CONFIG_FLAG.exec(word)
    if (match !== null) {
      given = match.groups!['value'] ?? words[index + 1] ?? null
    }
  }
  let files = new Set<string>()
  if (given === null) {
    for (let name of JEST_CONFIG_NAMES) {
      files.add(path.join(root, name))
    }
  } else if (!given.startsWith('{') || !given.endsWith('}')) {
    files.add(path.resolve(root, given))
  }
  let directories = new Set([root, ...input.directories])
  let tsconfigs = new Map<string, string[]>()
  for (let directory of directories) {
    for (let name of TRANSFORM_CONFIG_NAMES) {
      files.add(path.join(directory, name))
    }
    for (let file of listTsconfigFiles(directory, tsconfigs)) {
      files.add(file)
    }
  }
  return [...files]
}
