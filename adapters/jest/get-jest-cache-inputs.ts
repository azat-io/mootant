import path from 'node:path'

import type { JestAdapterOptions } from './types/jest-adapter-options'
import type { CacheInputs } from '../../types/adapter/cache-inputs'
import type { JestGlobalConfig } from './types/jest-global-config'
import type { JestPackages } from './types/jest-packages'
import type { JestCommand } from './types/jest-command'
import type { JestConsole } from './types/jest-console'
import type { JestProject } from './types/jest-project'
import type { JestReady } from './types/jest-ready'

import { VERDICT_VARIABLE_PATTERN } from '../shared/verdict-variable-pattern'
import { compareCodeUnits } from '../../core/compare-code-units'
import { listJestConfigPaths } from './list-jest-config-paths'
import { listJestConfigFiles } from './list-jest-config-files'
import { hashEnvironment } from '../shared/hash-environment'
import { isTransformInput } from './is-transform-input'

/**
 * Settings of a project configuration the cache leaves out: the cache
 * directory, which is mootant's, the id, which hashes absolute paths, and
 * coverage, reporters, watch mode, notifications and workers, which change no
 * verdict.
 */
const LEFT_OUT =
  /^(?:cacheDirectory|id|maxWorkers|reporters)$|^(?:collectCoverage|coverage|notify|watch)/u

/**
 * Settings of the global configuration that change what a test file does or
 * which of its tests run.
 */
const GLOBAL_SETTINGS = [
  'testNamePattern',
  'maxConcurrency',
  'testTimeout',
  'randomize',
  'useStderr',
  'seed',
]

/**
 * What stands for the project root in the strings of the settings.
 */
const ROOT = '<root>'

/**
 * Lists what every verdict of a Jest session depends on beyond what each test
 * file read. Files: the root `package.json`; the paths the resolved
 * configuration names (`listJestConfigPaths`); the configuration file of the
 * command and those of the transformers (`listJestConfigFiles`); what the
 * transformers, the test environments, the test runners and the projects' own
 * resolvers read in the dry runs of this session and earlier ones, which a warm
 * worker reads only once, so that a test file whose unit ran after it would
 * miss it, with the missing files among it only when they are named as
 * configuration files (`isTransformInput`); and the modules the host loaded, as
 * the configuration file imports them and global setup ran, but those under
 * `node_modules`, which the lockfile stands for, and mootant's own files.
 * Settings, with the root in their strings replaced so that a moved project
 * keeps them: per project its configuration without what changes no verdict,
 * and the console its tests print to; what of the global configuration picks
 * the tests of a file and how they run; the versions of Jest, of the
 * `@jest/transform` that strips types and of Node, whose own stripping and
 * targets change the code; whether every unit gets a new worker; and the
 * variables that change verdicts whether tests read them or not (`TZ`,
 * `NODE_ENV`, `LANG`, `LC_*`) with `BABEL_ENV`, which transformers read outside
 * the tests, `NODE_OPTIONS`, the Node flags and the variables the command and
 * the options set. Environment: the hashes of the variables of the host after
 * global setup, which every worker of every project starts from.
 *
 * @param input - What the session started with and what its dry runs read.
 * @param input.transforms - Files the transformers, the test environments, the
 *   test runners and the projects' own resolvers read in the dry runs of this
 *   session and earlier ones.
 * @param input.consoles - Console of the tests of each project, by name.
 * @param input.globalConfig - Global configuration.
 * @param input.options - Options of the adapter.
 * @param input.packages - Jest packages of the project.
 * @param input.projects - Kept projects.
 * @param input.command - Test command, for its variables and Node flags.
 * @param input.directory - Real directory of mootant's Jest files.
 * @param input.args - Jest's arguments that stayed after the filter.
 * @param input.ready - The host's `ready` message.
 * @param input.root - Real path of the project root.
 * @returns Files, settings and environment hashes for the cache key.
 */
export function getJestCacheInputs(input: {
  consoles: ReadonlyMap<string, JestConsole>
  projects: readonly JestProject[]
  transforms: ReadonlySet<string>
  globalConfig: JestGlobalConfig
  options: JestAdapterOptions
  args: readonly string[]
  packages: JestPackages
  command: JestCommand
  directory: string
  ready: JestReady
  root: string
}): CacheInputs {
  let { globalConfig, projects, command, options, ready, root } = input
  let hashes = hashEnvironment(ready.env)
  let files = new Set([
    path.join(root, 'package.json'),
    ...listJestConfigPaths({ globalConfig, projects }),
    ...listJestConfigFiles({
      directories: projects.map(({ config }) => config.rootDir),
      args: input.args,
      root,
    }),
    ...[...input.transforms].filter(file => isTransformInput(file)),
    ...ready.loaded.filter(
      file =>
        !/[/\\]node_modules[/\\]/u.test(file) &&
        !file.startsWith(`${input.directory}/`),
    ),
  ])
  let settings = {
    projects: projects.map(({ config, name }) => ({
      config: Object.fromEntries(
        Object.entries(config).filter(([key]) => !LEFT_OUT.test(key)),
      ),
      console: input.consoles.get(name)!,
      name,
    })),
    variables: Object.entries(hashes).filter(
      ([name]) => VERDICT_VARIABLE_PATTERN.test(name) || name === 'BABEL_ENV',
    ),
    global: Object.fromEntries(
      GLOBAL_SETTINGS.map(name => [name, Reflect.get(globalConfig, name)]),
    ),
    nodeOptions: ready.env['NODE_OPTIONS'] ?? null,
    freshWorkers: options.freshWorkers ?? false,
    transform: input.packages.transformVersion,
    env: { ...command.env, ...options.env },
    jest: input.packages.version,
    nodeFlags: command.nodeFlags,
    node: process.version,
  }
  return {
    environment: Object.fromEntries(projects.map(({ name }) => [name, hashes])),
    files: [...files].toSorted(compareCodeUnits),
    settings: replaceRoot(settings, root),
  }
}

/**
 * Replaces the project root in every string of a value of plain JSON.
 *
 * @param value - Settings, or a part of them.
 * @param root - Real path of the project root.
 * @returns A copy with `<root>` in place of the root.
 */
function replaceRoot(value: unknown, root: string): unknown {
  if (typeof value === 'string') {
    return value.replaceAll(root, ROOT)
  }
  if (Array.isArray(value)) {
    return value.map(item => replaceRoot(item, root))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceRoot(item, root),
      ]),
    )
  }
  return value
}
