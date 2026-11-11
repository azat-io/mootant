import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import type { DetectionScore } from '../../types/adapter/built-in-adapters'

import { readTestScripts } from '../shared/read-test-scripts'

/**
 * Word `jest` as a command in a script: alone or as the last segment of a path,
 * with or without `.js`, such as in `cross-env CI=1 jest`,
 * `node_modules/.bin/jest`, `npx jest`, `pnpm exec jest` or
 * `node_modules/jest/bin/jest.js`, but not in `jest.config.js`, `ts-jest`,
 * `@jest/globals` or `jest-environment-jsdom`.
 */
const JEST_COMMAND = /(?:^|[\s"&'(/;|])jest(?:\.js)?(?=$|[\s"&');|])/u

/**
 * Names of the configuration files Jest 29 or 30 looks for by itself in the
 * root.
 */
const JEST_CONFIG_NAME = /^jest\.config\.(?:[cm]?[jt]s|json)$/u

/**
 * Tells how surely a project runs its tests with Jest: a script it runs its
 * tests with calls Jest (2); Jest is a dependency or a development dependency,
 * `package.json` has a `jest` key, or the root has a `jest.config.*` that Jest
 * looks for by itself (1); or none of these (0). Starting the session reports a
 * version mootant does not support or a Jest that is missing.
 *
 * @param root - Project root.
 * @returns Score of the detection.
 */
export async function scoreJest(root: string): Promise<DetectionScore> {
  let scripts = await readTestScripts(root)
  if (scripts.some(command => JEST_COMMAND.test(command))) {
    return 2
  }
  if (await namesJest(root)) {
    return 1
  }
  let names = await readdir(root)
  return names.some(name => JEST_CONFIG_NAME.test(name)) ? 1 : 0
}

/**
 * Checks whether the `package.json` of the root names Jest: in its dependencies
 * or development dependencies, or as the `jest` key, which holds Jest's
 * configuration.
 *
 * @param root - Project root.
 * @returns True when it does; false otherwise or without a readable
 *   `package.json`.
 */
async function namesJest(root: string): Promise<boolean> {
  try {
    let manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8'),
    ) as { devDependencies?: object; dependencies?: object }
    return (
      Object.hasOwn(manifest, 'jest') ||
      Object.hasOwn(
        { ...manifest.dependencies, ...manifest.devDependencies },
        'jest',
      )
    )
  } catch {
    return false
  }
}
