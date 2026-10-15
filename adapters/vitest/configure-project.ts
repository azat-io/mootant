import type { TestProject } from 'vitest/node'

import type { VitestSessionState } from './types/vitest-session-state'

import { checkProjectConfig } from './check-project-config'
import { getProjectLabel } from './get-project-label'

/**
 * Sets up a Vitest project for mootant's runs: mootant's worker runner; the
 * forks pool, so a hung worker can be stopped, as mootant's own pool of forks
 * workers (`createForksPool`); a fresh worker and module graph per test file;
 * no shuffled tests, so runs follow the dry run's order (concurrency, retries
 * and repeats stay; the runner makes tests sequential where it switches mutants
 * between tries); snapshots are never written; transformed modules are not
 * cached on disk; test locations are recorded. Changing the pool or isolation
 * adds a `config-overridden` warning. An unsupported setting is recorded as the
 * session error instead. Typecheck-only projects are left alone.
 *
 * @param project - Vitest project as resolved from the user's configuration.
 * @param state - Session state that receives warnings and errors.
 */
export function configureProject(
  project: TestProject,
  state: VitestSessionState,
): void {
  let { config } = project
  if (config.typecheck.enabled && config.typecheck.only) {
    return
  }
  let problem = checkProjectConfig(project)
  if (problem !== null) {
    state.error ??= problem
    return
  }
  let label = getProjectLabel(project)
  if (config.pool !== 'forks') {
    state.diagnostics.push(
      createOverride(label, "pool: 'forks'", `pool: '${config.pool}'`),
    )
  }
  if (!config.isolate) {
    state.diagnostics.push(
      createOverride(label, 'isolate: true', 'isolate: false'),
    )
  }
  config.pool = state.pool.name
  config.poolRunner = state.pool
  config.isolate = true
  config.runner = state.runnerPath
  config.sequence.shuffle = false
  config.snapshotOptions.updateSnapshot = 'none'
  project.globalConfig.snapshotOptions.updateSnapshot = 'none'
  project.vitest.snapshot.options.updateSnapshot = 'none'
  config.fsModuleCache = false
  config.includeTaskLocation = true
}

/**
 * Builds the warning about a project setting mootant changed.
 *
 * @param label - Name of the project in messages.
 * @param value - Setting mootant uses.
 * @param old - Setting of the user's configuration.
 * @returns Diagnostic `config-overridden`.
 */
function createOverride(
  label: string,
  value: string,
  old: string,
): VitestSessionState['diagnostics'][number] {
  return {
    message: `mootant runs ${label} with ${value}; tests that depend on ${old} may fail in the dry run.`,
    code: 'config-overridden',
    severity: 'warning',
    column: null,
    line: null,
    file: null,
  }
}
