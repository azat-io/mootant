/**
 * Final state of a mutant after a run:
 *
 * - `Killed`: a test failed with the mutant active (`cause` tells how);
 * - `Timeout`: a test did not finish (hit limit, or timer or hang confirmed with
 *   doubled bounds); counts as detected;
 * - `Survived`: every test of the test files that cover it passed in a fresh
 *   module graph, and one of them reached it (always the isolated path);
 * - `NoCoverage`: no test reached it;
 * - `Ignored`: an ignore directive excluded it; not run;
 * - `Error`: mootant could not reach a verdict (see diagnostics).
 */
export type RunStatus =
  'NoCoverage' | 'Survived' | 'Ignored' | 'Timeout' | 'Killed' | 'Error'
