/**
 * Process ids of the test processes of this process that may still run, each
 * the leader of its process group.
 */
export const LIVE_PROCESS_GROUPS = new Set<number>()
