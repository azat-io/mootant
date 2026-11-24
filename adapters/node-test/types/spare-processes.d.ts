import type { ChildProcess } from 'node:child_process'

/**
 * Spare test processes of a run (`createSpareProcesses`).
 */
export interface SpareProcesses {
  /**
   * Gives a spare of its test file to a job that starts, if one is alive and
   * the job may take one, and starts the spares the next jobs need.
   *
   * @param index - Position of the job in the order given.
   * @param fresh - Whether the job must start a new process.
   * @returns The spare, or null to start a new process.
   */
  take(index: number, fresh: boolean): ChildProcess | null

  /**
   * Stops the spares no job took.
   */
  stop(): void
}
