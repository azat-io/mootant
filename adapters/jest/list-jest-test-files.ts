import { realpath } from 'node:fs/promises'
import path from 'node:path'

import type { JestGlobalConfig } from './types/jest-global-config'
import type { JestProject } from './types/jest-project'
import type { JestReady } from './types/jest-ready'

import { compareCodeUnits } from '../../core/compare-code-units'
import { listJestConfigPaths } from './list-jest-config-paths'

/**
 * Lists what mootant must never mutate: the test files of the kept projects,
 * the files their configuration names (`listJestConfigPaths`) and the files of
 * their `__mocks__` directories. The files of a skipped project stay out, or
 * real sources a lint project lists would never be mutated.
 *
 * @param input - What to read.
 * @param input.globalConfig - Global configuration.
 * @param input.projects - Kept projects.
 * @param input.ready - The host's `ready` message, with the tests of the kept
 *   projects.
 * @returns Real absolute paths, sorted, each once.
 */
export async function listJestTestFiles(input: {
  projects: readonly JestProject[]
  globalConfig: JestGlobalConfig
  ready: JestReady
}): Promise<string[]> {
  let mocks = input.projects.flatMap(({ config }) => {
    let moduleMap = input.ready.moduleMaps[config.id]
    return moduleMap === undefined ?
        []
      : moduleMap.mocks.map(([, file]) => path.resolve(moduleMap.rootDir, file))
  })
  let real = await Promise.all(
    [
      ...input.ready.tests.map(test => test.path),
      ...listJestConfigPaths(input),
      ...mocks,
    ].map(file => realpath(file)),
  )
  return [...new Set(real)].toSorted(compareCodeUnits)
}
