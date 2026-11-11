import { getJestCacheDirectory } from './get-jest-cache-directory'

/**
 * Lists the flags both the `--showConfig` run and the host get: no snapshot
 * writes, no coverage, mootant's own cache directory, and the false flags that
 * beat the same keys of a configuration file. `--seed=1` comes only when the
 * arguments have no seed before `--`, since a second `--seed` adds up.
 * `--maxWorkers` comes with a concurrency, which the filter made room for.
 *
 * @param root - Project root.
 * @param kept - Jest's arguments that stayed after the filter.
 * @param concurrency - Most test files at once, or null to keep Jest's own.
 * @returns The flags, in order.
 */
export function getJestBaseArguments(
  root: string,
  kept: readonly string[],
  concurrency: number | null,
): string[] {
  let end = kept.indexOf('--')
  let seeded = (end === -1 ? kept : kept.slice(0, end)).some(
    word => word === '--seed' || word.startsWith('--seed='),
  )
  return [
    '--ci',
    '--no-coverage',
    `--cacheDirectory=${getJestCacheDirectory(root)}`,
    '--watch=false',
    '--watchAll=false',
    '--onlyChanged=false',
    '--onlyFailures=false',
    '--lastCommit=false',
    '--changedFilesWithAncestor=false',
    ...(seeded ? [] : ['--seed=1']),
    ...(concurrency === null ? [] : [`--maxWorkers=${concurrency}`]),
  ]
}
