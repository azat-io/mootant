import type { JestProjectConfig } from './types/jest-project-config'
import type { JestGlobalConfig } from './types/jest-global-config'
import type { JestConsole } from './types/jest-console'

/**
 * Tells which console plain Jest gives the test files of a project in a run of
 * the whole suite: none when silent, one that writes at once when verbose, else
 * one that keeps what tests print for the results of their file. Jest 30 reads
 * the project's setting before the global one, and Jest 29 has none in a
 * project. A run of one test file turns `verbose` on, unless it is silent or
 * says no to it.
 *
 * @param input - What Jest reads.
 * @param input.globalConfig - Global configuration.
 * @param input.config - Configuration of the project.
 * @param input.tests - Test files of the run, one per project a file is in.
 * @returns What its tests print to.
 */
export function getJestConsole(input: {
  globalConfig: JestGlobalConfig
  config: JestProjectConfig
  tests: number
}): JestConsole {
  let { globalConfig, config, tests } = input
  let { silent, verbose = tests === 1 && silent !== true } = globalConfig
  if (config.silent ?? silent) {
    return 'none'
  }
  return (config.verbose ?? verbose) ? 'stream' : 'buffer'
}
