import path from 'node:path'

import type { DryFile } from '../../types/adapter/dry-file'

import { getTestFileKey } from '../run/get-test-file-key'
import { compareCodeUnits } from '../compare-code-units'
import { createDigest } from './create-digest'

/**
 * Builds the key of every test file whose dependencies the adapter reported:
 * the environment key, the file and its project, the hash of the test file and
 * of every file it depended on but the given mutated files, and the hash of the
 * value of every environment variable it read in its project, a variable that
 * is not set included. Incremental keys leave out the files mutants are listed
 * from, for which the region of a mutant stands (see `getMutantRegions`). Test
 * files without dependencies get no key, so their verdicts are neither reused
 * nor stored.
 *
 * @param input - Test files of the dry run, file hashes and environment.
 * @param input.files - Test files of the dry run.
 * @param input.hashes - Hashes of the files by absolute path, null for a
 *   missing one.
 * @param input.mutated - Absolute paths of the files the keys leave out; none
 *   for keys over every file.
 * @param input.environment - Environment key of the run.
 * @param input.variables - Hashes of the values of the environment variables of
 *   each project, by name (`CacheInputs.environment`).
 * @param input.root - Project root; paths are hashed relative to it.
 * @returns Keys by test file key (`getTestFileKey`).
 */
export function getTestFileKeys(input: {
  variables: Readonly<Record<string, Readonly<Record<string, string>>>>
  hashes: ReadonlyMap<string, string | null>
  mutated: ReadonlySet<string>
  files: readonly DryFile[]
  environment: string
  root: string
}): Map<string, string> {
  let { environment, variables, mutated, hashes, root } = input
  let keys = new Map<string, string>()
  for (let file of input.files) {
    if (!Array.isArray(file.dependencies)) {
      continue
    }
    let dependencies = [
      ...new Set([
        file.file,
        ...file.dependencies.filter(dependency => !mutated.has(dependency)),
      ]),
    ]
      .map(dependency => [
        path.relative(root, dependency).replaceAll('\\', '/'),
        hashes.get(dependency) ?? null,
      ])
      .toSorted(([left], [right]) => compareCodeUnits(left!, right!))
    let values =
      Object.hasOwn(variables, file.project) ? variables[file.project]! : {}
    let read = [...new Set(file.environment)]
      .toSorted(compareCodeUnits)
      .map(name => [name, Object.hasOwn(values, name) ? values[name]! : null])
    keys.set(
      getTestFileKey(file),
      createDigest([
        environment,
        path.relative(root, file.file).replaceAll('\\', '/'),
        file.project,
        dependencies,
        read,
      ]),
    )
  }
  return keys
}
