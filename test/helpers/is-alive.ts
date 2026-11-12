/**
 * Tells whether a process lives.
 *
 * @param pid - Its id.
 * @returns Whether a signal can reach it.
 */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
