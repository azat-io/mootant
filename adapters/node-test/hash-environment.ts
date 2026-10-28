import { createHash } from 'node:crypto'

import { indexEnvironmentHashes } from '../shared/index-environment-hashes'

/**
 * Hashes the environment variables of the test processes for the cache: the
 * SHA-256 of each value by name, and under `*` a hash of all of them but those
 * that change from one shell to another (`indexEnvironmentHashes`).
 *
 * @param environment - Environment variables of the test processes.
 * @returns Hashes by name, sorted by name, with `*`.
 */
export function hashEnvironment(
  environment: NodeJS.ProcessEnv,
): Record<string, string> {
  return indexEnvironmentHashes(
    Object.entries(environment).flatMap(([name, value]) =>
      value === undefined ?
        []
      : [[name, createHash('sha256').update(value).digest('hex')] as const],
    ),
    [],
  )
}
