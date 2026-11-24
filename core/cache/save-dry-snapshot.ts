import { writeFile, rename, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import type { ProjectTree } from '../../types/cache/project-tree'
import type { DrySnapshot } from '../../types/cache/dry-snapshot'

import { getDisplayPath } from '../run/get-display-path'
import { compareCodeUnits } from '../compare-code-units'
import { hashProjectTree } from './hash-project-tree'
import { hashFiles } from './hash-files'

/**
 * Saves the dry run of a run for later runs (`DrySnapshot`), or removes the
 * saved one when the run cannot be replayed. Before saving, the files of the
 * saved dry run and everything under the project root are hashed again: when
 * any of them changed during the run, such as a test file added while mutants
 * ran, which the dry run never saw, nothing is saved and the saved one is
 * removed too, and the first path that changed is named, against the tree the
 * run hashed before the test runner started. A tree that can no longer be read
 * is not saved either, with nothing to name. The file is written to a temporary
 * file and renamed, so a reader never sees half of it. Failures are ignored, as
 * a saved dry run only ever makes a run faster.
 *
 * @param input - What to save, and where.
 * @param input.snapshot - Saved dry run of the run (`createDrySnapshot`), or
 *   null when the run cannot be replayed.
 * @param input.tree - Project tree the run hashed before the test runner
 *   started, or null when it could not be read.
 * @param input.outputs - Absolute paths mootant writes into the project during
 *   or after a run, such as the HTML report and the work directory, which are
 *   left out.
 * @param input.file - Absolute path of the file (`getDrySnapshotPath`).
 * @param input.root - Project root.
 * @returns Null, or the end of a sentence that names a path that changed during
 *   the run, such as `logs was added during the run`.
 */
export async function saveDrySnapshot(input: {
  snapshot: DrySnapshot | null
  outputs: readonly string[]
  tree: ProjectTree | null
  file: string
  root: string
}): Promise<string | null> {
  let { snapshot, tree, file, root } = input
  if (snapshot === null || tree === null) {
    await remove(file)
    return null
  }
  let hashes = await hashFiles(snapshot.files.map(([name]) => name))
  let changed = snapshot.files.find(([name, hash]) => hashes.get(name) !== hash)
  if (changed !== undefined) {
    await remove(file)
    return `${getDisplayPath(changed[0], root)} changed during the run`
  }
  let after = await hashProjectTree(root, input.outputs)
  if (after?.hash !== tree.hash) {
    await remove(file)
    return after === null ? null : describeChange(tree, after)
  }
  await write(snapshot, file)
  return null
}

/**
 * Names the first path, in code unit order, whose entry differs between two
 * trees of the project.
 *
 * @param before - Tree before the test runner started.
 * @param after - Tree as the run ends, with another hash.
 * @returns The end of a sentence, such as `logs was added during the run`.
 */
function describeChange(before: ProjectTree, after: ProjectTree): string {
  let name = [...new Set([...before.entries.keys(), ...after.entries.keys()])]
    .toSorted(compareCodeUnits)
    .find(key => before.entries.get(key) !== after.entries.get(key))!
  if (!before.entries.has(name)) {
    return `${name} was added during the run`
  }
  return after.entries.has(name) ?
      `${name} changed during the run`
    : `${name} was removed during the run`
}

/**
 * Writes a saved dry run to a temporary file and renames it over the file, or
 * removes both when that fails.
 *
 * @param snapshot - Saved dry run.
 * @param file - Absolute path of the file.
 */
async function write(snapshot: DrySnapshot, file: string): Promise<void> {
  let temporary = `${file}.${process.pid}.tmp`
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(temporary, JSON.stringify(snapshot))
    await rename(temporary, file)
  } catch {
    await remove(temporary)
    await remove(file)
  }
}

/**
 * Removes a file if it exists, ignoring failures.
 *
 * @param file - Absolute path.
 */
async function remove(file: string): Promise<void> {
  try {
    await rm(file, { force: true })
  } catch {}
}
