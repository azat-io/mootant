import type { IsolatedResult } from './isolated-result'
import type { DryRunRequest } from './dry-run-request'
import type { Diagnostic } from '../mutant/diagnostic'
import type { DryRunResult } from './dry-run-result'
import type { IsolatedPlan } from './isolated-plan'
import type { BatchResult } from './batch-result'
import type { BatchPlan } from './batch-plan'

/**
 * Live test runner of one mootant run. Methods are called one at a time.
 */
export interface AdapterSession {
  /**
   * Executes isolated units in one run. Several units may share a test file;
   * they run one after another, in plan order, never at the same time, since a
   * plain run of the test runner never runs a test file twice at once and tests
   * may rely on it (a fixed file, port or database).
   */
  runIsolated(plan: IsolatedPlan): Promise<IsolatedResult>

  /**
   * Runs the selected tests without a mutant, each twice or once (see
   * `DryRunRequest.repeat`). A try is one run of a test as a plain run of the
   * test runner makes it, with the test's own repeats and retries.
   */
  dryRun(request: DryRunRequest): Promise<DryRunResult>

  /**
   * Executes a batch plan in one run of the test runner. Only called when the
   * adapter has `batch`.
   */
  runBatch(plan: BatchPlan): Promise<BatchResult>

  /**
   * Absolute paths of the modules a test file loaded in the last dry run, the
   * test file included. Optional; used by the incremental cache.
   */
  getModuleClosure?(testFile: string): string[]

  /**
   * Warnings found when the session started, such as test runner settings the
   * adapter changed. Optional.
   */
  diagnostics?: readonly Diagnostic[]

  /**
   * Absolute paths of test files and of files that set tests up (setup files,
   * global setup). They are never mutated.
   */
  listTestFiles(): Promise<string[]>

  /**
   * Stops the test runner and frees its resources. Safe to call twice.
   */
  close(): Promise<void>

  /**
   * Most test files the runner runs at once, as it resolved its settings; the
   * core plans for this many workers. Optional; the context's `concurrency`,
   * else the available parallelism minus one, when omitted.
   */
  workers?: number
}
