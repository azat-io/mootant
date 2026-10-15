import type { DryFile } from './dry-file'
import type { DryTest } from './dry-test'

/**
 * What a dry run observed.
 */
export interface DryRunResult {
  /**
   * Workers the adapter stopped because a try or the work outside tries ran
   * past `DryRunRequest.timeouts`: the test file, and the id and full name of
   * the test, or null outside tests.
   */
  hung: { test: string | null; name: string | null; file: string }[]

  /**
   * Switched files whose loaded text differed from `original`.
   */
  mismatched: string[]

  /**
   * Ids of the mutants whose sites the test runner evaluated outside the test
   * workers since the session started, where the adapter cannot switch mutants,
   * such as in Vitest's `globalSetup`; sorted. The core gives such a mutant
   * `Error` unless a test kills it or times out.
   */
  outside: string[]

  /**
   * Switched files the runner served at least once. A switched file outside
   * this list was never loaded through the adapter (no test imports it, or
   * tests load built output, an external or a pre-bundled dependency) and its
   * mutants cannot be reached.
   */
  served: string[]

  /**
   * Test files that ran, sorted by path.
   */
  files: DryFile[]

  /**
   * Tests that ran, in file order; skipped and todo tests are not listed.
   */
  tests: DryTest[]
}
