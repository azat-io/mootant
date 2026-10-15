import type { DryTest } from '../adapter/dry-test'

/**
 * Coverage and stability read from a dry run.
 */
export interface DryAnalysis {
  /**
   * Bounds of each test: the slower duration and the larger hit count of its
   * dry tries, by test id.
   */
  baselines: Map<string, { duration: number; hits: number }>

  /**
   * Path and project of every test file, by key.
   */
  testFiles: Map<string, { project: string; file: string }>

  /**
   * Bounds of each test file outside tries: loading plus suite hooks, and the
   * site evaluations outside tries, by key.
   */
  loads: Map<string, { duration: number; hits: number }>

  /**
   * Ids of the tests that reached a mutant in only one of their two tries, by
   * mutant id.
   */
  firstReach: Map<string, Set<string>>

  /**
   * Keys of the test files that reached a mutant outside any try, by mutant id.
   */
  loadCovers: Map<string, Set<string>>

  /**
   * Ids of the tests whose tries all reached a mutant, by mutant id.
   */
  stable: Map<string, Set<string>>

  /**
   * Ids of the tests of every test file in file order, by key.
   */
  fileTests: Map<string, string[]>

  /**
   * Tests of the dry run by id.
   */
  tests: Map<string, DryTest>

  /**
   * Position of every test in the dry run, which is file order.
   */
  order: Map<string, number>

  /**
   * Ids of the tests whose two tries differed in pass/fail or had stray errors.
   */
  unrepeatable: Set<string>

  /**
   * Keys of the test files with unhandled errors outside tries.
   */
  strayFiles: Set<string>

  /**
   * Ids of the tests with stray errors in a try.
   */
  strayTests: Set<string>
}
