import path from 'node:path'

import type { JestTimedRecord } from './types/jest-timed-record'

import { getPackageManifest } from '../../core/files/get-package-manifest'
import { listPackageFiles } from '../../core/files/list-package-files'
import { compareCodeUnits } from '../../core/compare-code-units'

/**
 * Lists what a test file depended on in a unit that ended: the test file, what
 * the unit read, the CommonJS modules its worker loaded in its own realm, such
 * as a transformer and what it imports, which a warm worker no longer reads,
 * the `package.json` files that decide the format and the `#` imports of the
 * files in the directory of each of them (`listPackageFiles`), for a file of an
 * installed package the `package.json` that decides what an import of the
 * package resolves to (`getPackageManifest`), and the snapshot file Jest
 * resolves for the test file by default, `__snapshots__/<name>.snap` beside it,
 * whether it exists or not. The file a custom snapshot resolver gives is among
 * the reads, as Jest looks for it when the unit starts. The worker leaves out
 * of the reads what lies under `node_modules` but the modules Jest's runtime
 * loaded for the vm, mootant's own files and, outside the directories of the
 * session, the root itself and what `createInputFilter` leaves out, what Jest's
 * resolver read, as a real load is read anyway, and what only the transformers,
 * the test environment and the test runner in their own calls, or a project's
 * own resolver read, which every verdict depends on: through
 * `getJestCacheInputs` when a dry run read it, a missing file there only when
 * named as a configuration file (`isTransformInput`), else through
 * `state.lateTransforms`, which `runIsolated` adds.
 *
 * @param records - Records of the unit.
 * @param file - Absolute path of the test file.
 * @returns Absolute paths, sorted, or null when the unit left no `finish` or
 *   its worker could not see every read.
 */
export function collectJestDependencies(
  records: readonly JestTimedRecord[],
  file: string,
): string[] | null {
  let finish = records.find(record => record.kind === 'finish')
  if (!finish?.tracked) {
    return null
  }
  let read = [file, ...finish.reads, ...finish.loaded]
  let files = new Set([
    ...read,
    path.join(
      path.dirname(file),
      '__snapshots__',
      `${path.basename(file)}.snap`,
    ),
  ])
  for (let entry of read) {
    let manifest = getPackageManifest(entry)
    if (manifest !== null) {
      files.add(manifest)
    }
  }
  let directories = new Set(read.map(entry => path.dirname(entry)))
  let packages = new Map<string, string[]>()
  for (let directory of directories) {
    for (let found of listPackageFiles(directory, packages)) {
      files.add(found)
    }
  }
  return [...files].toSorted(compareCodeUnits)
}
