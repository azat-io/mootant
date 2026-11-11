import type { JestProjectConfig } from './jest-project-config'
import type { JestGlobalConfig } from './jest-global-config'

/**
 * What mootant reads of the JSON `--showConfig` prints.
 */
export interface JestConfig {
  /**
   * Global configuration of the run.
   */
  globalConfig: JestGlobalConfig

  /**
   * Configuration of every project, those a flag leaves out included.
   */
  configs: JestProjectConfig[]
}
