import type { TestProject } from 'vitest/node'

import { getProjectLabel } from './get-project-label'

/**
 * Finds a project setting mootant cannot run with: a custom test runner,
 * browser mode, a pool other than `forks` and `threads`, or Vitest's native
 * module runner, which loads modules without Vite transforms.
 *
 * @param project - Vitest project as resolved from the user's configuration.
 * @returns Sentence naming the setting, or null when mootant can run it.
 */
export function checkProjectConfig(project: TestProject): string | null {
  let { config } = project
  let label = getProjectLabel(project)
  if (config.runner) {
    return `mootant runs tests with its own Vitest runner, so ${label} cannot use the custom runner ${config.runner}.`
  }
  if (config.browser.enabled) {
    return `mootant does not run browser tests yet; ${label} enables browser mode.`
  }
  if (config.pool !== 'forks' && config.pool !== 'threads') {
    return `mootant needs the forks or threads pool; ${label} uses the ${config.pool} pool.`
  }
  if (config.experimental.viteModuleRunner === false) {
    return `mootant needs Vite's module runner; experimental.viteModuleRunner: false in ${label} loads modules without Vite transforms.`
  }
  return null
}
