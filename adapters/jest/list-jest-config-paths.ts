import type { JestGlobalConfig } from './types/jest-global-config'
import type { JestProject } from './types/jest-project'

import { compareCodeUnits } from '../../core/compare-code-units'

/**
 * Lists the files the resolved configuration of the kept projects names,
 * outside `node_modules`: setup files, global setup and teardown, the test
 * environment and framework, resolvers, serializers, the test sequencer, the
 * runtime and transformers. The global setup and teardown of a configuration
 * with `projects` are only in the global configuration. A setting left empty,
 * as `null` or `''`, names none.
 *
 * @param input - What to read.
 * @param input.globalConfig - Global configuration.
 * @param input.projects - Kept projects.
 * @returns Absolute paths, sorted, each once.
 */
export function listJestConfigPaths(input: {
  projects: readonly JestProject[]
  globalConfig: JestGlobalConfig
}): string[] {
  let { globalConfig } = input
  let paths = [
    ...input.projects.flatMap(({ config }) => [
      ...config.snapshotSerializers,
      ...config.setupFilesAfterEnv,
      ...config.setupFiles,
      config.testEnvironment,
      config.testRunner,
      ...config.transform.map(([, file]) => file),
      config.dependencyExtractor,
      config.snapshotResolver,
      config.globalTeardown,
      config.globalSetup,
      config.resolver,
      config.runtime,
    ]),
    globalConfig.globalTeardown,
    globalConfig.globalSetup,
    globalConfig.testSequencer,
  ].filter(
    (file): file is string =>
      typeof file === 'string' &&
      file !== '' &&
      !/[/\\]node_modules[/\\]/u.test(file),
  )
  return [...new Set(paths)].toSorted(compareCodeUnits)
}
