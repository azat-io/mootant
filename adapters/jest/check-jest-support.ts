import type { JestConfig } from './types/jest-config'

/**
 * Refuses what makes Jest run tests in a way mootant cannot follow:
 * `JEST_JASMINE=1`, which replaces the test framework of every project, and
 * `changedSince` in the configuration, which the host cannot turn off and which
 * hides the tests of unchanged files.
 *
 * @param input - What to check.
 * @param input.config - Resolved configuration.
 * @param input.env - Environment of the Jest processes.
 * @throws {Error} When the project uses one of them.
 */
export function checkJestSupport(input: {
  env: NodeJS.ProcessEnv
  config: JestConfig
}): void {
  if (input.env['JEST_JASMINE'] === '1') {
    throw new Error(
      'mootant runs Jest with jest-circus, but JEST_JASMINE=1 selects jest-jasmine2; unset the variable.',
    )
  }
  if ((input.config.globalConfig.changedSince ?? '') !== '') {
    throw new Error(
      'mootant runs every test file, but the Jest configuration sets changedSince; remove it from the configuration.',
    )
  }
}
