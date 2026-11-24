import path from 'node:path'

import type { PoolWorkerOptions } from './types/mootant-forks-pool'

import { readNodeOptions } from '../shared/read-node-options'
import { listFlagValues } from '../shared/list-flag-values'
import { allowsSpares } from '../shared/allows-spares'
import { LOADER_FLAGS } from '../shared/loader-flags'

/**
 * Gives the key of the workers a spare forks worker can serve. The process of a
 * forks worker depends only on its environment variables, its flags and
 * Vitest's worker entry, and starts in mootant's working directory; the
 * project, the test environment and the test files come later, in messages. A
 * worker whose flags or `NODE_OPTIONS` load a module other than Vitest's own
 * `suppress-warnings.cjs`, take flags or code from a file, or watch the process
 * (`allowsSpares`) gets no spare, so no code of the project runs before the
 * task takes the worker.
 *
 * @param options - Options of the worker.
 * @returns The key, or null when the worker gets no spare.
 */
export function getSpareKey(
  options: Pick<PoolWorkerOptions, 'distPath' | 'execArgv' | 'env'>,
): string | null {
  let { distPath, execArgv, env } = options
  let own = path.resolve(distPath, '../suppress-warnings.cjs')
  let flags = [...readNodeOptions(env['NODE_OPTIONS'] ?? ''), ...execArgv]
  if (
    !allowsSpares(flags) ||
    listFlagValues(flags, LOADER_FLAGS).some(module => module !== own)
  ) {
    return null
  }
  return JSON.stringify([env, execArgv, distPath, process.cwd()])
}
