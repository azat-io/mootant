import path from 'node:path'

import type { JestProjectConfig } from './types/jest-project-config'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { JestProject } from './types/jest-project'
import type { JestConfig } from './types/jest-config'

/**
 * Picks the projects mootant runs, those on Jest's own runner and not on
 * jest-jasmine2, and names them without absolute paths, since `config.id`
 * hashes those: no name when one is kept, else the display name, else the
 * directory relative to the root, with a number added to a name that repeats. A
 * skipped project gets a warning.
 *
 * @param input - What to read.
 * @param input.config - Resolved configuration.
 * @param input.root - Real path of the project root, as Jest's `rootDir` is
 *   one.
 * @returns The kept projects and the warnings.
 * @throws {Error} When no project is left.
 */
export function listJestProjects(input: { config: JestConfig; root: string }): {
  diagnostics: Diagnostic[]
  projects: JestProject[]
} {
  let kept = input.config.configs.filter(config => isSupported(config))
  if (kept.length === 0) {
    throw new Error(
      `mootant runs only Jest's own runner with jest-circus, and no Jest project in ${input.root} uses them; set them in the Jest configuration.`,
    )
  }
  let names = new Set<string>()
  return {
    diagnostics: input.config.configs
      .filter(config => !isSupported(config))
      .map(config => ({
        message: `mootant runs only Jest's own runner with jest-circus, so it skips the Jest project ${config.displayName?.name ?? config.rootDir}.`,
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      })),
    projects: kept.map(config => ({
      name: kept.length === 1 ? '' : createName(config, input.root, names),
      config,
    })),
  }
}

/**
 * Names a project of several and remembers the name.
 *
 * @param config - Configuration of the project.
 * @param root - Real path of the project root.
 * @param names - Names taken so far, filled here.
 * @returns A name no other project has.
 */
function createName(
  config: JestProjectConfig,
  root: string,
  names: Set<string>,
): string {
  let base =
    config.displayName?.name ??
    path.relative(root, config.rootDir).replaceAll(path.sep, '/')
  let name = base
  for (let index = 1; names.has(name); index++) {
    name = `${base}-${index}`
  }
  names.add(name)
  return name
}

/**
 * Tells whether mootant runs a project, with `\` read as `/` in its paths.
 *
 * @param config - Configuration of the project.
 * @returns Whether its runner is Jest's own and its framework not
 *   jest-jasmine2.
 */
function isSupported(config: JestProjectConfig): boolean {
  return (
    config.runner
      .replaceAll('\\', '/')
      .endsWith('/jest-runner/build/index.js') &&
    !config.testRunner.replaceAll('\\', '/').includes('/jest-jasmine2/')
  )
}
