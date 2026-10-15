import type { PoolRunnerInitializer, Vitest } from 'vitest/node'

import type { AdapterContext } from '../../../types/adapter/adapter-context'
import type { SwitchedFile } from '../../../types/adapter/switched-file'
import type { Diagnostic } from '../../../types/mutant/diagnostic'

/**
 * State shared by the Vitest session, its Vite plugin and the project
 * configuration hook.
 */
export interface VitestSessionState {
  /**
   * Switched files by real path, or null until the plugin or a dry run reads
   * `AdapterContext.files`.
   */
  files: Map<string, SwitchedFile> | null

  /**
   * Pool the projects run with (`createForksPool`).
   */
  pool: PoolRunnerInitializer

  /**
   * Real paths of the module ids the plugin has seen, by id.
   */
  keys: Map<string, string>

  /**
   * `config-overridden` warnings about the projects.
   */
  diagnostics: Diagnostic[]

  /**
   * Switched files whose loaded text differed from the listed one.
   */
  mismatched: Set<string>

  /**
   * Whether the plugin serves switched texts; false while a dry run checks the
   * tests without them.
   */
  instrumented: boolean

  /**
   * Ids of the mutants whose sites switched code evaluated in the main process,
   * outside the workers, such as in a `globalSetup` file.
   */
  outside: Set<string>

  /**
   * First unsupported project configuration, as a sentence, or null.
   */
  error: string | null

  /**
   * Switched files the plugin served.
   */
  served: Set<string>

  /**
   * Absolute path of mootant's worker runner.
   */
  runnerPath: string
}

/**
 * Live Vitest instance of a session with what the session methods share.
 */
export interface VitestHandle {
  /**
   * State shared with the plugin.
   */
  state: VitestSessionState

  /**
   * Context the core started the session with.
   */
  context: AdapterContext

  /**
   * Vitest instance of the session.
   */
  vitest: Vitest
}
