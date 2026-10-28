import path from 'node:path'

import type { CacheInputs } from '../../types/adapter/cache-inputs'

import { VERDICT_VARIABLE_PATTERN } from '../shared/verdict-variable-pattern'
import { listTsconfigFiles } from '../shared/list-tsconfig-files'
import { hashEnvironment } from './hash-environment'
import { listFlagValues } from './list-flag-values'

/**
 * Flags whose value is a file Node reads itself: `.env` files and the Node
 * configuration file.
 */
const FILE_FLAGS = new Set([
  '--experimental-config-file',
  '--env-file-if-exists',
  '--env-file',
])

/**
 * Lists what every verdict of a node:test session depends on beyond the
 * dependencies of each test file: `package.json` of the root, which holds the
 * test command, `node.config.json`, the files of `--env-file`,
 * `--env-file-if-exists` and `--experimental-config-file`, the setup files the
 * flags load, and, when tsx compiles modules, the `tsconfig.json` files of the
 * root; the version of Node, the filtered flags, the variables the command and
 * the options set, `NODE_OPTIONS` and the variables that change verdicts
 * whether tests read them or not (`TZ`, `NODE_ENV`, `LANG`, `LC_*`); and the
 * hashes of the variables of the test processes.
 *
 * @param input - What the test processes run with.
 * @param input.root - Project root.
 * @param input.version - Version of Node, such as `v22.12.0`.
 * @param input.execArgv - Flags of the test processes, without the preload.
 * @param input.env - Environment variables of the test processes.
 * @param input.set - Variables the command and the options set.
 * @param input.setup - Absolute paths of the setup files the flags load.
 * @param input.tsx - Whether the test processes load tsx.
 * @returns Files, settings and environment hashes for the cache key.
 */
export function getNodeCacheInputs(input: {
  set: Record<string, string>
  setup: readonly string[]
  env: NodeJS.ProcessEnv
  execArgv: string[]
  version: string
  root: string
  tsx: boolean
}): CacheInputs {
  let { execArgv, root } = input
  let files = new Set([
    path.join(root, 'node.config.json'),
    path.join(root, 'package.json'),
    ...input.setup,
  ])
  for (let target of listFlagValues(execArgv, FILE_FLAGS)) {
    files.add(path.resolve(root, target))
  }
  let tsconfigs = input.tsx ? listTsconfigFiles(root, new Map()) : []
  for (let file of tsconfigs) {
    files.add(file)
  }
  let hashes = hashEnvironment(input.env)
  return {
    settings: {
      variables: Object.entries(hashes).filter(([name]) =>
        VERDICT_VARIABLE_PATTERN.test(name),
      ),
      nodeOptions: input.env['NODE_OPTIONS'] ?? null,
      version: input.version,
      env: input.set,
      execArgv,
    },
    environment: { '': hashes },
    files: [...files],
  }
}
