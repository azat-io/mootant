import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { CacheInputs } from '../../types/adapter/cache-inputs'
import type { ProjectTree } from '../../types/cache/project-tree'
import type { DrySnapshot } from '../../types/cache/dry-snapshot'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { RunCache } from '../../types/cache/run-cache'

import { listVariableHashes } from './list-variable-hashes'
import { compareCodeUnits } from '../compare-code-units'
import { CACHE_VERSION } from './cache-version'

/**
 * What a saved dry run is built from.
 */
interface SnapshotInput {
  /**
   * Outcome of the dry phase: the final dry run, the messages of the files
   * whose mutants get no verdict, by display path, its diagnostics and its runs
   * of the test runner.
   */
  phase: {
    errors: ReadonlyMap<string, string>
    diagnostics: Diagnostic[]
    dry: DryRunResult
    runs: number
  }

  /**
   * Environment variables of the main process as the run started, before the
   * test runner could set any, such as `NODE_ENV`.
   */
  environment: NodeJS.ProcessEnv

  /**
   * Everything under the project root before the test runner started
   * (`hashProjectTree`), or null when a directory or link could not be read.
   */
  tree: ProjectTree | null

  /**
   * Live session of the run.
   */
  session: AdapterSession

  /**
   * What the session said every verdict depends on, as `prepareRunCache` asked
   * it once.
   */
  inputs: CacheInputs

  /**
   * Test files and setup files of the session.
   */
  testFiles: string[]

  /**
   * Cache of the run after it was saved.
   */
  cache: RunCache

  /**
   * Key of the run (`getDrySnapshotKey`).
   */
  key: string
}

/**
 * Builds the saved dry run of a run whose cache was saved (`DrySnapshot`), with
 * the hashes the cache keys took in after the dry run, and each environment
 * variable that test code read in the dry run or in a unit whose evidence the
 * cache reused or stored. A run gets none when a test file of the dry run has
 * no key: the adapter cannot tell what it depended on, or one of its
 * dependencies changed during the run or has unknown content (`UNKNOWN_HASH`),
 * so the saved files never name such a file. Nor does a run whose dry phase ran
 * the tests more than once, as after a test file that failed and passed when it
 * ran again, since a fresh dry run may not repeat what it kept, and nor does
 * one with a directory or link of the project it could not read.
 *
 * @param input - Dry phase, session, cache, environment, tree and key.
 * @returns The saved dry run, or null when the run cannot be replayed.
 */
export function createDrySnapshot(input: SnapshotInput): DrySnapshot | null {
  let { session, phase, cache, tree } = input
  if (
    tree === null ||
    cache.dependencies.size !== phase.dry.files.length ||
    phase.runs !== 1
  ) {
    return null
  }
  let files = new Set([
    ...cache.environment,
    ...[...cache.dependencies.values()].flat(),
  ])
  return {
    variables: listVariableHashes(
      [
        ...phase.dry.files.flatMap(file => file.environment ?? []),
        ...[...cache.inputs.values(), ...cache.pending.values()].flatMap(
          value => value.environment.map(([name]) => name),
        ),
      ],
      input.environment,
    ),
    session: {
      diagnostics: [...(session.diagnostics ?? [])],
      version: session.version ?? null,
      workers: session.workers ?? null,
      inputs: input.inputs,
    },
    files: [...files]
      .toSorted(compareCodeUnits)
      .map(file => [file, cache.hashes.get(file) ?? null]),
    phase: {
      diagnostics: phase.diagnostics,
      errors: [...phase.errors],
      dry: phase.dry,
    },
    testFiles: input.testFiles,
    version: CACHE_VERSION,
    tree: tree.hash,
    key: input.key,
  }
}
