import { stopLiveProcessGroups } from './stop-live-process-groups'
import { LIVE_PROCESS_GROUPS } from './live-process-groups'

/**
 * Signals on which mootant stops the test processes it started before it ends.
 */
const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

/**
 * Remembers a test process, which leads a process group of its own and so gets
 * no signal the terminal sends, until it ends: while any is remembered, this
 * process stops them all when it exits or gets SIGINT or SIGTERM.
 *
 * @param pid - Process id of the test process.
 * @returns Function that forgets the process once it ended.
 */
export function trackProcessGroup(pid: number): () => void {
  if (!process.listeners('exit').includes(stopLiveProcessGroups)) {
    process.on('exit', stopLiveProcessGroups)
    for (let signal of SIGNALS) {
      process.on(signal, onSignal)
    }
  }
  LIVE_PROCESS_GROUPS.add(pid)
  return () => {
    LIVE_PROCESS_GROUPS.delete(pid)
    if (LIVE_PROCESS_GROUPS.size === 0) {
      release()
    }
  }
}

/**
 * Stops the live test processes when this process gets a signal; when no other
 * listener handles the signal, raises it again, so the process ends as it would
 * without this listener.
 *
 * @param signal - Signal this process got.
 */
function onSignal(signal: NodeJS.Signals): void {
  stopLiveProcessGroups()
  release()
  if (process.listenerCount(signal) === 0) {
    process.kill(process.pid, signal)
  }
}

/**
 * Removes the listeners that stop the live test processes.
 */
function release(): void {
  process.off('exit', stopLiveProcessGroups)
  for (let signal of SIGNALS) {
    process.off(signal, onSignal)
  }
}
