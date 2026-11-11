import type { WorkerProject } from '../types/worker-project'

/**
 * Pattern of the last transformer entry, which matches every file. Not `^`:
 * Jest keeps loaded transformers under pattern and path, all entries here have
 * one path, and a project's own `^` would collide and lose its transformer.
 */
const CATCH_ALL_PATTERN = '^(?:)'

/**
 * Makes the copy of a project's configuration that a unit runs: mootant's test
 * framework, first setup file and transformer wrap the project's, and so does a
 * last setup file when the test environment or the test runner is the project's
 * own, not a package, as its calls may read a file once in a worker. A file no
 * pattern matches would have no transformer, and Jest's fallback key hashes the
 * copy's `configString`, which holds per-run paths; the catch-all gives it the
 * wrapper's key. `silent` and `verbose` are cleared because Jest 30.4 reads the
 * project's first, and one copy serves dry runs and units.
 *
 * @param config - Configuration as `--showConfig` printed it.
 * @param plan - Absolute path of the switch plan, or null; a new path per plan,
 *   so each plan gets its own entry in Jest's in-memory transforms.
 * @param directory - Real path of the directory of mootant's Jest files.
 * @returns The copy.
 */
export function wrapProjectConfig(
  config: WorkerProject['config'],
  plan: string | null,
  directory: string,
): {
  testLocationInResults: boolean
  detectLeaks: boolean
  verbose: undefined
  silent: undefined
  cache: boolean
} & WorkerProject['config'] {
  let transformer = `${directory}/transformer.cjs`
  let escaped = directory.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)
  return {
    ...config,
    setupFiles: [
      `${directory}/vm-setup.cjs`,
      ...config.setupFiles,
      ...((
        [config.testEnvironment, config.testRunner].some(
          file => !/[/\\]node_modules[/\\]/u.test(file),
        )
      ) ?
        [`${directory}/vm-setup-end.cjs`]
      : []),
    ],
    transform: [
      ...config.transform.map(
        ([pattern, real, realConfig]): [string, string, unknown] => [
          pattern,
          transformer,
          { realConfig, real, plan },
        ],
      ),
      [CATCH_ALL_PATTERN, transformer, { real: null, plan }],
    ],
    transformIgnorePatterns: [
      `^${escaped}/`,
      ...config.transformIgnorePatterns,
    ],
    testRunner: `${directory}/test-runner.cjs`,
    testLocationInResults: true,
    detectLeaks: false,
    verbose: undefined,
    silent: undefined,
    cache: true,
  }
}
