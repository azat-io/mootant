import type { Vitest } from 'vitest/node'

/**
 * Pattern of the keys of defines whose value Vitest's script puts into the
 * environment variables of the worker, where the environment tracking sees it.
 */
const VARIABLE_KEY = /^(?:import\.meta\.env|process\.env)\./u

/**
 * Lists, by project name, the defines Vitest runs as a script in the workers
 * (`_scriptDefines`): those whose value is not JSON, which the script evaluates
 * as code, and those whose key holds a dot, by key, with whether the value is
 * code, as Vitest tells them. A key that becomes an environment variable of the
 * worker is left out unless its value is code, which may change anything as it
 * runs.
 *
 * @param vitest - Vitest instance of the session.
 * @returns Whether the value of each define is code, by key, by project name.
 */
export function listScriptDefines(
  vitest: Vitest,
): Record<string, Record<string, boolean>> {
  let projects: Record<string, Record<string, boolean>> = {}
  for (let project of vitest.projects) {
    let defines = (Reflect.get(project.config, '_scriptDefines') ??
      {}) as Record<string, unknown>
    let keys: Record<string, boolean> = {}
    for (let [key, value] of Object.entries(defines)) {
      let code = isCode(value)
      if (code || !VARIABLE_KEY.test(key)) {
        keys[key] = code
      }
    }
    projects[project.name] = keys
  }
  return projects
}

/**
 * Tells whether Vitest's script evaluates the value of a define as code: a
 * string that is not JSON.
 *
 * @param value - Value of the define in the configuration.
 * @returns Whether it is code.
 */
function isCode(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }
  try {
    JSON.parse(value)
    return false
  } catch {
    return true
  }
}
