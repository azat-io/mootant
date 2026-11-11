import type { AdapterContext } from '../../../types/adapter/adapter-context'
import type { DryRunRequest } from '../../../types/adapter/dry-run-request'
import type { JestConsole } from './jest-console'
import type { JestProject } from './jest-project'
import type { WorkerPool } from './worker-pool'
import type { JestReady } from './jest-ready'
import type { HeapCap } from './heap-cap'

/**
 * A live Jest session, as its methods see it.
 */
export interface JestHandle {
  /**
   * What the session keeps between its runs.
   */
  state: {
    /**
     * Budgets of the last dry run, or null before one.
     */
    timeouts: DryRunRequest['timeouts'] | null

    /**
     * Files each test file read in its last dry run, by `getTestFileKey`; a
     * test file with no `finish` has no entry, so it runs again.
     */
    reads: Map<string, readonly string[]>

    /**
     * Files the transformers, the test environments, the test runners and the
     * projects' own resolvers read in isolated units and checks but in no dry
     * run, as for a module only a mutant loads. Every isolated verdict of a
     * plan depends on what this holds when the plan ends: a warm worker keeps
     * the module transformed, so its later units read none of these, and on
     * another worker Jest's disk cache may spare `process`.
     */
    lateTransforms: Set<string>

    /**
     * Files the transformers of the projects, the test environments, the test
     * runners and the projects' own resolvers read in the dry runs so far,
     * which every verdict depends on, as a warm worker reads them only once.
     */
    transforms: Set<string>

    /**
     * Ids of the sites that ran in a worker's own realm since the session
     * started.
     */
    outside: Set<string>

    /**
     * Units that gave no facts or lost them to the check at the end of their
     * chain, by mutant, test file and project name joined with a zero
     * character; every later run of one is a clean attempt.
     */
    noFacts: Set<string>

    /**
     * Absolute path of the switch plan of the last instrumented dry run, or
     * null before one.
     */
    plan: string | null

    /**
     * Switch plans written so far, which numbers their directories.
     */
    plans: number

    /**
     * Units sent so far, which numbers their out files.
     */
    units: number
  }

  /**
   * Console plain Jest gives the test files of each kept project in a run of
   * the whole suite, by project name.
   */
  consoles: ReadonlyMap<string, JestConsole>

  /**
   * Kept projects.
   */
  projects: readonly JestProject[]

  /**
   * Test files of the kept projects, with the id of their project.
   */
  tests: JestReady['tests']

  /**
   * What the core gave the adapter.
   */
  context: AdapterContext

  /**
   * Whether every attempt is a clean one, so no worker runs a second unit.
   */
  freshWorkers: boolean

  /**
   * Absolute real directory of the files of the Jest processes.
   */
  directory: string

  /**
   * Workers of the session.
   */
  pool: WorkerPool

  /**
   * Heap limit of new workers.
   */
  heap: HeapCap

  /**
   * Real path of the project root.
   */
  root: string
}
