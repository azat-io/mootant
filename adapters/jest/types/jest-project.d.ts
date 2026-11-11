import type { JestProjectConfig } from './jest-project-config'

/**
 * Project of a Jest configuration that mootant runs.
 */
export interface JestProject {
  /**
   * Configuration as `--showConfig` printed it.
   */
  config: JestProjectConfig

  /**
   * Name that holds no absolute path, unique in the session; empty when the
   * session has one project.
   */
  name: string
}
