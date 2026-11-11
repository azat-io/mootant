import type { JestProjectConfig } from './jest-project-config'
import type { JestModuleMap } from './jest-module-map'

/**
 * What the host's runner reads of a test file Jest hands it.
 */
export interface HostTest {
  /**
   * Project of the test file.
   */
  context: {
    /**
     * Haste map of the project.
     */
    moduleMap: { toJSON(): JestModuleMap }

    /**
     * Configuration of the project, as Jest resolved it in this process.
     */
    config: JestProjectConfig
  }

  /**
   * Absolute path of the test file.
   */
  path: string
}
