import { execFile } from 'node:child_process'

/**
 * Stops a hung worker process with `SIGKILL`, but only when the process is
 * still alive and, outside Windows, is a child of this process: a process id
 * may have been reused by an unrelated process.
 *
 * @param pid - Process id of the worker.
 * @returns Whether the worker was stopped.
 * @throws {Error} When the signal fails for another reason than a process that
 *   is gone.
 */
export async function stopHungWorker(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  if (
    process.platform !== 'win32' &&
    (await getParentPid(pid)) !== process.pid
  ) {
    return false
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false
    }
    throw error
  }
  return true
}

/**
 * Asks `ps` for the parent of a process.
 *
 * @param pid - Process id.
 * @returns Parent process id, or null when the process is gone.
 */
function getParentPid(pid: number): Promise<number | null> {
  return new Promise(resolve => {
    execFile('ps', ['-o', 'ppid=', '-p', String(pid)], (error, stdout) => {
      resolve(error === null ? Number(stdout.trim()) : null)
    })
  })
}
