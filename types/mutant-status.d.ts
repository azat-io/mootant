/**
 * Lifecycle state of a mutant. Later commands add the outcomes of test runs,
 * such as `Killed` and `Survived`.
 */
export type MutantStatus = 'Ignored' | 'Pending'
