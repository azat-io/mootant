/**
 * Test command of a project as mootant reads it from a script, before Node
 * flags are filtered.
 */
export interface NodeTestCommand {
  /**
   * Tool the script runs: Node itself, tsx, better-node-test (`bnt`), which
   * finds its test files and picks TypeScript flags itself, or borp.
   */
  tool: 'node' | 'borp' | 'bnt' | 'tsx'

  /**
   * Environment variables the command sets.
   */
  env: Record<string, string>

  /**
   * Node flags of the command in order, each with its value, such as
   * `['--import', 'tsx']` or `['--test-only']`.
   */
  flags: string[][]

  /**
   * Test files, directories or globs relative to the project root, as given;
   * empty for the tool's defaults.
   */
  files: string[]
}
