import { existsSync } from 'node:fs'
import path from 'node:path'

import { TRANSFORM_CONFIG_NAMES } from './transform-config-names'

/**
 * Names of the configuration files of Babel, swc and Browserslist.
 */
const CONFIG_NAMES = new Set(TRANSFORM_CONFIG_NAMES)

/**
 * Name of a TypeScript configuration file, which ts-jest takes under any name.
 */
const TSCONFIG_NAME = /^tsconfig(?:\..+)?\.json$/u

/**
 * Tells whether a file the transformers, the test environments, the test
 * runners or the projects' own resolvers read is an input of verdicts: one that
 * exists, or a missing one named as a configuration file of Babel, swc,
 * Browserslist or TypeScript, as creating it changes the code they give. Other
 * missing files are probes, such as TypeScript's for the files an import may
 * name, which ts-jest makes only while its own cache lacks the module: they
 * would change the key of an unchanged project from one run to the next. Jest's
 * resolver probes count nowhere either.
 *
 * @param file - Absolute path.
 * @returns Whether it is an input.
 */
export function isTransformInput(file: string): boolean {
  let name = path.basename(file)
  return CONFIG_NAMES.has(name) || TSCONFIG_NAME.test(name) || existsSync(file)
}
