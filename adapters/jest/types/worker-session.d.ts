import type { JestGlobalConfig } from './jest-global-config'
import type { JestModuleMap } from './jest-module-map'
import type { WorkerProject } from './worker-project'
import type { JestPackages } from './jest-packages'

/**
 * What a worker reads of `session.json`.
 */
export interface WorkerSession {
  /**
   * What the reads of a unit count, besides those under `node_modules` and
   * mootant's own files, which never do.
   */
  reads: {
    /**
     * Absolute directories whose files count: the real path of the project
     * root, and the `rootDir` and `roots` of every project.
     */
    directories: string[]

    /**
     * Extensions, without the dot, of the files that count wherever they are
     * but in the temporary directory: the `moduleFileExtensions` of every
     * project, and `snap`, since a custom snapshot resolver may put a snapshot
     * file anywhere.
     */
    extensions: string[]
  }

  /**
   * Kept projects that have test files.
   */
  projects: {
    /**
     * Configuration as `--showConfig` printed it.
     */
    config: WorkerProject['config']

    /**
     * JSON form of the project's haste map.
     */
    moduleMap: JestModuleMap

    /**
     * Id of the project.
     */
    id: string
  }[]

  /**
   * Global configuration.
   */
  globalConfig: JestGlobalConfig

  /**
   * Jest packages of the project.
   */
  packages: JestPackages

  /**
   * Mask of new files global setup left, which a plain run's workers inherit.
   */
  umask: number
}
