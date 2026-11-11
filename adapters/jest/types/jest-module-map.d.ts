/**
 * What mootant reads of the JSON form of a project's haste map; the rest
 * travels with it.
 */
export interface JestModuleMap {
  /**
   * Files of `__mocks__` directories as `[module name, path from rootDir]`.
   */
  mocks: [string, string][]

  /**
   * Absolute directory the paths start from.
   */
  rootDir: string
}
