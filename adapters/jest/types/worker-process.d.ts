/**
 * What a worker uses of its process.
 */
export interface WorkerProcess {
  /**
   * Sends a message to main; a process forked with a channel has it.
   */
  send?(message: unknown, callback?: (error: Error | null) => void): boolean

  /**
   * Adds a listener.
   */
  on(event: string, listener: (value: unknown) => void): unknown

  /**
   * Gives a core module.
   */
  getBuiltinModule(name: string): undefined | object

  /**
   * Removes every listener of an event.
   */
  removeAllListeners(event: string): unknown

  /**
   * Standard error.
   */
  stderr: { write(text: string): unknown }

  /**
   * Environment variables.
   */
  env: Record<string, undefined | string>

  /**
   * Lists the kinds of what keeps the event loop alive, one item each.
   */
  getActiveResourcesInfo(): string[]

  /**
   * Gives the mask of new files, after setting it to the one given, if any.
   */
  umask(mask?: number): number

  /**
   * Ends the process.
   */
  exit(code: number): unknown

  /**
   * Node flags of the process, which `fork` passes on by default.
   */
  execArgv: string[]

  /**
   * Standard output.
   */
  stdout: unknown

  /**
   * Gives the working directory.
   */
  cwd(): string
}
