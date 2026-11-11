import type { JestProjectConfig } from './jest-project-config'
import type { JestGlobalConfig } from './jest-global-config'
import type { JestModuleMap } from './jest-module-map'

/**
 * Message the parked host process sends once Jest has run its global setup.
 */
export interface JestReady {
  /**
   * Test files with the id of their project, one entry per project a file is
   * in.
   */
  tests: { project: string; path: string }[]

  /**
   * Configuration by project id, for the projects that have test files, as the
   * host resolved it and ran global setup with: Jest reads a configuration file
   * anew in every process, and one that differs from one reading to the next,
   * such as one that makes a directory for the run, would give workers what
   * global setup never saw.
   */
  configs: Record<string, JestProjectConfig>

  /**
   * Haste map by project id, for the projects that have test files.
   */
  moduleMaps: Record<string, JestModuleMap>

  /**
   * Global configuration as the host resolved it, mootant's flags of the host
   * among it.
   */
  globalConfig: JestGlobalConfig

  /**
   * Environment of the host after global setup.
   */
  env: Record<string, string>

  /**
   * Absolute paths of the modules the host loaded.
   */
  loaded: string[]

  /**
   * Kind of the message.
   */
  type: 'ready'

  /**
   * Mask of new files of the host after global setup.
   */
  umask: number

  /**
   * Working directory of the host after global setup.
   */
  cwd: string
}
