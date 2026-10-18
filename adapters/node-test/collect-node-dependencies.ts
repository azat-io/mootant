import path from 'node:path'

import type { NodeTestRecord } from './types/node-test-record'

import { listTsconfigFiles } from '../shared/list-tsconfig-files'
import { compareCodeUnits } from '../../core/compare-code-units'
import { listPackageFiles } from './list-package-files'
import { listLoadedFiles } from './list-loaded-files'

/**
 * Lists what a test file depended on in a test process that reached its end:
 * the test file, its default snapshot file (`<file>.snapshot`), whether it
 * exists or not, the modules the process loaded (`listLoadedFiles`) and the
 * project files the test code read, without files under `node_modules`, which
 * the lockfile stands for, and without mootant's preload; for the directory of
 * each module, the `package.json` files that decide its format
 * (`listPackageFiles`) and, when tsx compiles modules, the `tsconfig.json`
 * files that decide how (`listTsconfigFiles`).
 *
 * @param input - Records of the process and what to look up.
 * @param input.records - Records of the process.
 * @param input.file - Absolute path of the test file.
 * @param input.preload - Absolute path of mootant's preload.
 * @param input.tsx - Whether the test processes load tsx.
 * @param input.cache - Lists found before by directory, shared by the test
 *   files of a run.
 * @returns Absolute paths, sorted, or null when the process did not reach its
 *   end.
 */
export function collectNodeDependencies(input: {
  cache: { tsconfigs: Map<string, string[]>; packages: Map<string, string[]> }
  records: readonly NodeTestRecord[]
  preload: string
  file: string
  tsx: boolean
}): string[] | null {
  let { records, cache, file } = input
  let end = records.find(record => record.kind === 'end')
  if (end === undefined) {
    return null
  }
  let excluded = path.dirname(input.preload) + path.sep
  /**
   * Tells whether a path is a project file.
   *
   * @param candidate - Path a record named.
   * @returns Whether it counts.
   */
  function counts(candidate: string): boolean {
    return (
      path.isAbsolute(candidate) &&
      !candidate.includes(`${path.sep}node_modules${path.sep}`) &&
      !candidate.startsWith(excluded)
    )
  }
  let modules = [file, ...listLoadedFiles(records)].filter(counts)
  let files = new Set([
    ...modules,
    `${file}.snapshot`,
    ...end.files.filter(counts),
  ])
  let directories = new Set(modules.map(module => path.dirname(module)))
  for (let directory of directories) {
    for (let found of listPackageFiles(directory, cache.packages)) {
      files.add(found)
    }
    if (input.tsx) {
      for (let found of listTsconfigFiles(directory, cache.tsconfigs)) {
        files.add(found)
      }
    }
  }
  return [...files].toSorted(compareCodeUnits)
}
