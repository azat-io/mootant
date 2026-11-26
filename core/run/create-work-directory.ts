import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { LIVE_WORK_DIRECTORIES } from './live-work-directories'

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
 * heartbeats) in the system temporary directory. Until it is removed, it is
 * among the live work directories (`LIVE_WORK_DIRECTORIES`), which an
 * interrupted run whose cleanup takes too long removes before the process ends
 * (`removeLiveWorkDirectories`).
 *
 * @returns Path of the directory and a function that deletes it.
 */
export async function createWorkDirectory(): Promise<WorkDirectory> {
  let directory = await mkdtemp(path.join(tmpdir(), 'mootant-'))
  LIVE_WORK_DIRECTORIES.add(directory)
  return {
    remove: async () => {
      await rm(directory, { recursive: true, force: true })
      LIVE_WORK_DIRECTORIES.delete(directory)
    },
    path: directory,
  }
}
