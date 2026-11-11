import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { JestHostEnd } from './types/jest-host'

import { getDisplayPath } from '../../core/run/get-display-path'
import { compareCodeUnits } from '../../core/compare-code-units'

/**
 * Tells what went wrong as the host of a session ended, once `close` asked it
 * to. Jest runs global teardown then, after the last unit, so verdicts stand,
 * and calls its results processor after it: a host that exited with another
 * code than 0 before that failed in global teardown or the test sequencer,
 * which fails a plain run of Jest too, while one that got there failed on its
 * own results. Of those, the host meets only snapshot files whose test file is
 * gone, which fail a plain run of Jest with every test passing, so they fail
 * the run, by name, once each, though Jest lists one for every project whose
 * files it is among, as snapshots no test checked fail a dry run. A host that
 * had exited before `close` asked, when no run was going on to fail, never ran
 * global teardown, and what global setup started went with it. A teardown that
 * did not end in time was stopped, where a plain run of Jest would wait for
 * it.
 *
 * @param ended - How the host ended.
 * @param root - Real path of the project root, which display paths are relative
 *   to.
 * @returns An error that fails the run, a warning, or nothing.
 */
export function readTeardown(ended: JestHostEnd, root: string): Diagnostic[] {
  if (ended.early) {
    return [
      {
        message: `The Jest process that ran global setup ${ended.how} before the run ended, so global teardown did not run, and what global setup started went with it; its last output:\n${ended.output}`,
        code: 'teardown-failed',
        severity: 'error',
        column: null,
        file: null,
        line: null,
      },
    ]
  }
  if (ended.stopped) {
    return [
      {
        message:
          "Jest's global teardown did not end in time, so mootant stopped it; a plain run of Jest would wait for it.",
        code: 'teardown-failed',
        severity: 'warning',
        column: null,
        file: null,
        line: null,
      },
    ]
  }
  if (ended.obsolete.length > 0) {
    let files = [...new Set(ended.obsolete)]
      .map(file => getDisplayPath(file, root))
      .toSorted(compareCodeUnits)
    return [
      {
        message: `Jest found snapshot files whose test file is gone, which fails a plain run of Jest too: ${files.join(', ')}; remove them, or run jest -u.`,
        code: 'teardown-failed',
        severity: 'error',
        column: null,
        file: null,
        line: null,
      },
    ]
  }
  if (ended.code === 0 || ended.finished) {
    return []
  }
  return [
    {
      message: `Jest ${ended.how} in global teardown or the test sequencer, which fails a plain run of Jest too; its last output:\n${ended.output}`,
      code: 'teardown-failed',
      severity: 'error',
      column: null,
      file: null,
      line: null,
    },
  ]
}
