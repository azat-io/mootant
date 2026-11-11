import type { JestGlobalConfig } from './types/jest-global-config'
import type { JestProject } from './types/jest-project'
import type { JestReady } from './types/jest-ready'

/**
 * Keys of the global configuration that mootant's flags set in the host, for
 * its own runner's report and end.
 */
const HOST_KEYS = [
  'testResultsProcessor',
  'passWithNoTests',
  'forceExit',
  'reporters',
]

/**
 * Gives the configuration a session works with once its host is ready: the one
 * the host resolved and ran global setup with, as Jest reads a configuration
 * file anew in each process and one that differs from one reading to the next
 * would give global setup, the tests and the cache key three different ones.
 * Where mootant's flags set the host's own runner, reporters, results processor
 * and exits, the values of `--showConfig` stay, as nothing of the work
 * directory, a new one each run, may reach a key of the transforms or of the
 * verdicts. A project without test files keeps what `--showConfig` gave.
 *
 * @param input - What `--showConfig` gave and what the host sent.
 * @param input.globalConfig - Global configuration of `--showConfig`.
 * @param input.projects - Kept projects, with the configurations of
 *   `--showConfig`.
 * @param input.ready - The host's `ready` message.
 * @returns The global configuration and the kept projects of the session.
 */
export function readHostConfig(input: {
  projects: readonly JestProject[]
  globalConfig: JestGlobalConfig
  ready: JestReady
}): { globalConfig: JestGlobalConfig; projects: JestProject[] } {
  let { globalConfig, projects, ready } = input
  return {
    projects: projects.map(project => {
      let config = ready.configs[project.config.id]
      return config === undefined ? project : (
          { ...project, config: { ...config, runner: project.config.runner } }
        )
    }),
    globalConfig: {
      ...ready.globalConfig,
      ...Object.fromEntries(
        HOST_KEYS.map(key => [key, Reflect.get(globalConfig, key) as unknown]),
      ),
    },
  }
}
