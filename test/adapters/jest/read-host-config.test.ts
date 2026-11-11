import { describe, expect, it } from 'vitest'

import type { JestProjectConfig } from '../../../adapters/jest/types/jest-project-config'
import type { JestGlobalConfig } from '../../../adapters/jest/types/jest-global-config'
import type { JestProject } from '../../../adapters/jest/types/jest-project'

import { readHostConfig } from '../../../adapters/jest/read-host-config'

/**
 * Builds a kept project as `--showConfig` gave it.
 *
 * @param id - Key of the project among the host's configurations.
 * @returns A project with Jest's own runner and the setup file of the first
 *   reading.
 */
function createProject(id: string): JestProject {
  return {
    config: {
      runner: '/p/node_modules/jest-runner/build/index.js',
      setupFiles: ['/p/setup-1.js'],
      id,
    } as JestProjectConfig,
    name: id,
  }
}

describe('readHostConfig', () => {
  it("takes the host's configuration, but its runner and the global keys mootant's flags set there, which keep the values of --showConfig", () => {
    let globalConfig = {
      testResultsProcessor: undefined,
      reporters: [['default', {}]],
      detectOpenHandles: false,
      testSequencer: '/s.js',
      passWithNoTests: false,
      testTimeout: 5000,
      forceExit: false,
      maxWorkers: 2,
    } as JestGlobalConfig
    let kept = createProject('kept')
    let empty = createProject('no-tests')
    let host = {
      ...kept.config,
      runner: '/w/mootant-1/jest/runner.host',
      setupFiles: ['/p/setup-2.js'],
    }

    expect(
      readHostConfig({
        ready: {
          globalConfig: {
            ...globalConfig,
            testResultsProcessor: '/w/mootant-1/jest/results.cjs',
            reporters: [['/w/mootant-1/jest/noop.cjs', {}]],
            passWithNoTests: true,
            testTimeout: 9000,
            forceExit: true,
          } as JestGlobalConfig,
          configs: { kept: host },
          moduleMaps: {},
          type: 'ready',
          umask: 0o022,
          loaded: [],
          tests: [],
          cwd: '/p',
          env: {},
        },
        projects: [kept, empty],
        globalConfig,
      }),
    ).toStrictEqual({
      projects: [
        {
          config: { ...host, runner: kept.config.runner },
          name: 'kept',
        },
        empty,
      ],
      globalConfig: { ...globalConfig, testTimeout: 9000 },
    })
  })
})
