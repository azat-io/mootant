import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Work directory of one run.
 */
interface WorkDirectory {
  /**
   * Deletes the directory with everything in it.
   */
  remove(): Promise<void>

  /**
   * Absolute path of the directory.
   */
  path: string
}

/**
 * Creates a fresh directory for the files of one run (plans, results,
 * heartbeats) in the system temporary directory.
 *
 * @returns Path of the directory and a function that deletes it.
 */
export async function createWorkDirectory(): Promise<WorkDirectory> {
  let directory = await mkdtemp(path.join(tmpdir(), 'mootant-'))
  return {
    remove: () => rm(directory, { recursive: true, force: true }),
    path: directory,
  }
}
