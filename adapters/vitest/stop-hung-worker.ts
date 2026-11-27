import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'

import type { MootantForksPool } from './types/mootant-forks-pool'

/**
 * Stops a hung worker process with `SIGKILL`. The pool stops it through the
 * process of its worker, which cannot stand for another process, and leaves a
 * process id that is none of its workers (`MootantForksPool.stopWorker`).
 * Should Vitest stop exposing the processes of its workers, the process is
 * stopped by its id, but only when it is still alive and, outside Windows, a
 * child of this process, as a process id may have been reused by an unrelated
 * process: the parent comes from `/proc/<pid>/stat` where Linux provides it,
 * else from `ps`. A process whose parent neither tells is left.
 *
 * @param pid - Process id of the worker.
 * @param pool - Pool of the session.
 * @returns Whether the worker was stopped.
 * @throws {Error} When the signal fails for another reason than a process that
 *   is gone.
 */
export async function stopHungWorker(
  pid: number,
  pool: Pick<MootantForksPool, 'stopWorker'>,
): Promise<boolean> {
  let stopped = pool.stopWorker(pid)
  if (stopped !== null) {
    return stopped
  }
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  if (
    process.platform !== 'win32' &&
    (readParentPid(pid) ?? (await askParentPid(pid))) !== process.pid
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
 * Reads the parent of a process from `/proc/<pid>/stat`: the second field after
 * the name in parentheses, which may hold spaces and parentheses itself.
 *
 * @param pid - Process id.
 * @returns Parent process id, or null when the file cannot be read, as outside
 *   Linux.
 */
function readParentPid(pid: number): number | null {
  let stat: string
  try {
    stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  } catch {
    return null
  }
  let [, parent] = stat.slice(stat.lastIndexOf(')') + 2).split(' ', 2)
  return Number(parent)
}

/**
 * Asks `ps` for the parent of a process.
 *
 * @param pid - Process id.
 * @returns Parent process id, or null when `ps` fails: the process is gone, or
 *   `ps` is missing or lacks `-p`, as BusyBox's does.
 */
function askParentPid(pid: number): Promise<number | null> {
  return new Promise(resolve => {
    execFile('ps', ['-o', 'ppid=', '-p', String(pid)], (error, stdout) => {
      resolve(error === null ? Number(stdout.trim()) : null)
    })
  })
}
