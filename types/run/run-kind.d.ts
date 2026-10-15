/**
 * Kind of a run of the test runner:
 *
 * - `dry`: the tests without a mutant, each twice;
 * - `batch`: a batch phase;
 * - `recovery`: batch tries that went missing, planned again;
 * - `confirmation`: batch timeouts tried again with doubled bounds;
 * - `isolated`: isolated units.
 */
export type RunKind = 'confirmation' | 'recovery' | 'isolated' | 'batch' | 'dry'
