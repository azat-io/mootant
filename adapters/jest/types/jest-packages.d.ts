/**
 * Jest packages of a project, found from each other, starting at `jest` in the
 * root, so strict pnpm and a mismatched hoisted copy both work.
 */
export interface JestPackages {
  /**
   * Version of the `@jest/transform` of `jest-runner`, such as `30.5.2`.
   */
  transformVersion: string

  /**
   * Whether the `@jest/transform` of `jest-runner` strips the types of a
   * TypeScript file no transformer of the project claims, as 30.5.2 and later
   * do.
   */
  stripsTypes: boolean

  /**
   * Absolute directory of `jest-haste-map`.
   */
  hasteMap: string

  /**
   * Absolute directory of the `@jest/console` of `jest-runner`.
   */
  console: string

  /**
   * Absolute directory of `jest-resolve`.
   */
  resolve: string

  /**
   * Absolute directory of `jest-runtime`.
   */
  runtime: string

  /**
   * Version of `@jest/core`, such as `30.5.2`.
   */
  version: string

  /**
   * Absolute directory of `jest-runner`.
   */
  runner: string

  /**
   * Absolute directory of `jest-util`.
   */
  util: string

  /**
   * Absolute path of the file Jest's binary runs.
   */
  bin: string
}
