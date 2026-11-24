import type { ProjectTree } from '../../types/cache/project-tree'
import type { DrySnapshot } from '../../types/cache/dry-snapshot'

import { listVariableHashes } from './list-variable-hashes'
import { getDisplayPath } from '../run/get-display-path'
import { createDigest } from './create-digest'
import { hashFiles } from './hash-files'

/**
 * Tells whether the inputs of a saved dry run (`DrySnapshot`) are unchanged,
 * the cheapest check first, before a run builds its switched files for the key:
 * the environment variables of the main process, the files the dry run and the
 * cache keys depended on, then everything under the project root
 * (`hashProjectTree`), which a run that starts the test runner hashes anyway. A
 * file that is now a device, a pipe or a socket (`UNKNOWN_HASH`) has another
 * hash than any saved one, which never names such a file.
 *
 * @param snapshot - Saved dry run of an earlier run.
 * @param run - Environment, root and tree of this run.
 * @param run.environment - Environment variables of the main process as the run
 *   started, before a test runner could set any.
 * @param run.root - Project root, for the paths of the reason.
 * @param run.tree - Hashes everything under the project root, once per run.
 * @returns Null when the inputs are unchanged, else the end of a sentence that
 *   tells what changed, such as `src/a.test.ts changed`.
 */
export async function checkDrySnapshot(
  snapshot: DrySnapshot,
  run: {
    tree(): Promise<ProjectTree | null>
    environment: NodeJS.ProcessEnv
    root: string
  },
): Promise<string | null> {
  let variables = listVariableHashes(
    snapshot.variables.map(([name]) => name),
    run.environment,
  )
  if (createDigest(variables) !== createDigest(snapshot.variables)) {
    return 'an environment variable changed'
  }
  let hashes = await hashFiles(snapshot.files.map(([file]) => file))
  let changed = snapshot.files.find(([file, hash]) => hashes.get(file) !== hash)
  if (changed !== undefined) {
    return `${getDisplayPath(changed[0], run.root)} changed`
  }
  let tree = await run.tree()
  if (tree === null) {
    return 'mootant cannot read every directory and link of the project'
  }
  if (tree.hash !== snapshot.tree) {
    return 'a file of the project was added, removed or changed'
  }
  return null
}
