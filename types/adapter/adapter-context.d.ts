import type { SwitchedFile } from './switched-file'

/**
 * What the core gives an adapter when a session starts.
 */
export interface AdapterContext {
  /**
   * Files to serve switched. A module whose loaded text differs from `original`
   * (see `resolveSwitchedText`) is served as is and reported in
   * `DryRunResult.mismatched`. Any module with a query in its id, and any file
   * not listed, is served as is. The core adds files until the first `dryRun`
   * and may remove the files that broke tests before repeating it; an adapter
   * reads the list again at the start of every `dryRun` and drops cached
   * transforms of removed files.
   */
  files: readonly SwitchedFile[]

  /**
   * Most test files at once, or null to keep the runner's own setting.
   */
  concurrency: number | null

  /**
   * Directory for files of this run (plans, results, heartbeats); the core
   * creates it and removes it after `close`.
   */
  workDirectory: string

  /**
   * Project root: the directory of the mootant configuration, else the working
   * directory.
   */
  root: string
}
