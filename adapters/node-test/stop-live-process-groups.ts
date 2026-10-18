import { LIVE_PROCESS_GROUPS } from './live-process-groups'
import { stopProcessGroup } from './stop-process-group'

/**
 * Stops every test process that may still run, with the processes of its group
 * (`stopProcessGroup`), and forgets them.
 */
export function stopLiveProcessGroups(): void {
  for (let pid of LIVE_PROCESS_GROUPS) {
    stopProcessGroup(pid)
  }
  LIVE_PROCESS_GROUPS.clear()
}
