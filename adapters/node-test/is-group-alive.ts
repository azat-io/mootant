/**
 * Tells whether a process group has a process left. A group that cannot be
 * looked at, as on Windows, counts as one with processes left.
 *
 * @param pid - Process id of the leader of the group.
 * @returns Whether a process of the group is left.
 */
export function isGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}
