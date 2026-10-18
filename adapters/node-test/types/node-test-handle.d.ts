import type { AdapterContext } from '../../../types/adapter/adapter-context'
import type { NodeTestUnit } from './node-test-unit'

/**
 * Live node:test session: how it starts test processes and what its runs
 * learned.
 */
export interface NodeTestHandle {
  /**
   * Checks that the test processes can load TypeScript files and mootant can
   * switch them (`checkTypeScript`).
   *
   * @param files - Absolute paths of the files.
   * @returns A sentence naming the problem, or null.
   */
  checkTypeScript(files: readonly string[]): string | null

  /**
   * Context the core started the session with.
   */
  context: AdapterContext

  /**
   * Environment variables of every test process, before `MOOTANT_UNIT`.
   */
  env: NodeJS.ProcessEnv

  /**
   * What a run learned for later runs of the session.
   */
  state: NodeTestState

  /**
   * Milliseconds of the project's `--test-timeout`, or 0 without it, which the
   * budgets of dry runs add.
   */
  testTimeout: number

  /**
   * Real absolute paths of the test files, sorted.
   */
  files: string[]

  /**
   * Absolute path of mootant's preload; its directory is never a dependency.
   */
  preload: string

  /**
   * Most test processes at once.
   */
  workers: number

  /**
   * Flags of every test process before its test file: mootant's preload first,
   * unless `NODE_OPTIONS` loads modules and carries it, then the command's
   * filtered flags and the extra ones of the options.
   */
  args: string[]

  /**
   * Whether the test processes load tsx, so `tsconfig.json` files decide how
   * modules compile.
   */
  tsx: boolean

  /**
   * Node binary of the test processes.
   */
  node: string
}

/**
 * What the runs of a node:test session learned.
 */
export interface NodeTestState {
  /**
   * Tests that failed in the last dry run of a test file that exited with 0,
   * such as failing todo tests, by test file.
   */
  expected: Map<string, NodeTestUnit['expected']>

  /**
   * Absolute paths of the modules each test file loaded in its last dry run, by
   * test file.
   */
  modules: Map<string, Set<string>>

  /**
   * Whether a test file reported a todo test or suite in its last dry run, by
   * test file.
   */
  todo: Map<string, boolean>

  /**
   * Absolute path of the switch plan of the last instrumented dry run, or null
   * before one.
   */
  plan: string | null

  /**
   * Test processes started in the session, which names their out files.
   */
  count: number
}
