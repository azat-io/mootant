import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { DetectionScore } from '../../types/adapter/built-in-adapters'

import { readTestScripts } from '../shared/read-test-scripts'
import { getDefaultPatterns } from './get-default-patterns'
import { listNodeTestFiles } from './list-node-test-files'
import { resolveCommand } from './resolve-command'
import { parseCommand } from './parse-command'

/**
 * Packages that run node:test, as dependencies of a project.
 */
const WRAPPERS = ['better-node-test', 'borp']

/**
 * The quoted module name `node:test`, as an import or a `require()` writes it.
 */
const NODE_TEST_IMPORT = /["'`]node:test["'`]/u

/**
 * Tells how surely a project runs its tests with node:test: a script it runs
 * its tests with runs node:test (2), as `findTestCommand` would read it; the
 * project depends on better-node-test or borp, or a file Node would take as a
 * test file names `node:test` (1); or neither (0).
 *
 * @param root - Project root.
 * @returns Score of the detection.
 */
export async function scoreNodeTest(root: string): Promise<DetectionScore> {
  let scripts = await readTestScripts(root)
  let called = scripts.some(script =>
    parseCommand(script).some(words => resolveCommand(words) !== null),
  )
  if (called) {
    return 2
  }
  if (await dependsOnWrapper(root)) {
    return 1
  }
  let files = await listNodeTestFiles(
    root,
    [],
    getDefaultPatterns('node', true),
  )
  return (await importsNodeTest(files)) ? 1 : 0
}

/**
 * Checks whether the `package.json` of the root lists a package that runs
 * node:test in its dependencies or development dependencies.
 *
 * @param root - Project root.
 * @returns True when one is listed; false otherwise or without a readable
 *   `package.json`.
 */
async function dependsOnWrapper(root: string): Promise<boolean> {
  try {
    let manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8'),
    ) as Record<string, unknown>
    return ['dependencies', 'devDependencies'].some(field => {
      let list = manifest[field]
      return (
        typeof list === 'object' &&
        list !== null &&
        WRAPPERS.some(name => Object.hasOwn(list, name))
      )
    })
  } catch {
    return false
  }
}

/**
 * Checks the files one after another until one names `node:test`, skipping
 * files it cannot read.
 *
 * @param files - Absolute paths of the files.
 * @returns True when a file names `node:test`.
 */
async function importsNodeTest(files: readonly string[]): Promise<boolean> {
  let [file, ...rest] = files
  if (file === undefined) {
    return false
  }
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch {}
  return NODE_TEST_IMPORT.test(text) || importsNodeTest(rest)
}
