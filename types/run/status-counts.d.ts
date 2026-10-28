import type { RunStatus } from './run-status'

/**
 * Number of mutants with each final status.
 */
export type StatusCounts = Record<RunStatus, number>
