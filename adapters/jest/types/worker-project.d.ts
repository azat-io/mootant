import type { JestProjectConfig } from './jest-project-config'

/**
 * Project as a worker knows it, without mootant's paths.
 */
export interface WorkerProject {
  /**
   * Configuration as `--showConfig` printed it.
   */
  config: JestProjectConfig

  /**
   * The configuration as JSON, which a transformer's cache key holds.
   */
  configString: string
}
