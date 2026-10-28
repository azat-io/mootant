/**
 * Variables Vitest numbers its workers with: they differ from worker to worker
 * and are not inputs of a test, so the environment tracking ignores them and
 * the cache leaves them out of the hash of all variables.
 */
export const VITEST_VARIABLES = ['VITEST_WORKER_ID', 'VITEST_POOL_ID']
