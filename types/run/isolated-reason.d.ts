/**
 * Why a mutant took the isolated path:
 *
 * - `static`: a test file reached it while loading;
 * - `first-reach`: in fast mode, a test reached it in only one of its two dry
 *   tries;
 * - `unrepeatable`: in fast mode, a covering test passed once and failed once
 *   without a mutant, or had stray errors;
 * - `doubtful`: a batch try could not decide it (see `TryVerdict`), a control try
 *   next to its kill failed, a late error followed its try, a suite hook of its
 *   batch unit failed, or no batch try reached it;
 * - `batch-survivor`: it passed every batch try that reached it; batch passes are
 *   not trusted, so a fresh module graph with its whole covering test files
 *   decides whether it survives;
 * - `recovery`: batch tries went missing twice;
 * - `no-batch`: in fast mode, the adapter has no batch mode.
 */
export type IsolatedReason =
  | 'batch-survivor'
  | 'unrepeatable'
  | 'first-reach'
  | 'no-batch'
  | 'recovery'
  | 'doubtful'
  | 'static'
