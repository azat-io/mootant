/**
 * Stops a test process and every process it started with `SIGKILL`: the process
 * group it leads, as test processes start detached, so servers and workers the
 * tests started stop too. Where process groups cannot be signalled, as on
 * Windows, the process alone. A group that is gone is left alone.
 *
 * @param pid - Process id of the test process, the leader of its group.
 */
export function stopProcessGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {}
    }
  }
}
