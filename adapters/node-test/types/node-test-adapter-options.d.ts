/**
 * Settings of `nodeTestAdapter()`, which runs mutants with Node's built-in test
 * runner.
 */
export interface NodeTestAdapterOptions {
  /**
   * Extra environment variables of the test processes.
   */
  env?: Record<string, string>

  /**
   * Extra Node flags, after those of the command.
   */
  execArgv?: string[]

  /**
   * Test command as a `package.json` script has it, such as `node --test
   * --import tsx 'test/**\/*.test.ts'` or `bnt`; it is parsed, never run. Found
   * in the test scripts of `package.json` when omitted.
   */
  command?: string

  /**
   * Test files or globs relative to the project root, instead of those of the
   * command.
   */
  files?: string[]

  /**
   * Node binary that runs the tests; the one running mootant when omitted.
   */
  node?: string
}
