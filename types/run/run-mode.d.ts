/**
 * How a run decides its mutants:
 *
 * - `isolated`, the default: every covered mutant runs on a fresh module graph
 *   with its whole covering test files, as a plain run of the test runner with
 *   the mutant written in would;
 * - `fast` (`--fast`): runtime mutants are tried first in batch runs, where one
 *   test run tries many mutants one after another. Batch kills are accepted as
 *   they are and are heuristic: state an earlier try left can fail a test that
 *   the mutant alone would pass, so a kill with `path: 'batch'` may be false.
 *   Batch survivors are always checked again on a fresh module graph.
 */
export type RunMode = 'isolated' | 'fast'
