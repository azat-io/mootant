import { describe, expect, it } from 'vitest'

import { readTeardown } from '../../../adapters/jest/read-teardown'

describe('readTeardown', () => {
  it.each([
    ['that exited with code 0', 0, false],
    [
      'that failed on its own results after it reached its results processor, with no snapshot file of a gone test',
      1,
      true,
    ],
  ])('tells nothing of a host %s', (_name, code, finished) => {
    expect(
      readTeardown(
        {
          how: `exited with code ${code}`,
          stopped: false,
          obsolete: [],
          early: false,
          output: '',
          finished,
          code,
        },
        '/p',
      ),
    ).toStrictEqual([])
  })

  it('fails the run on the snapshot files whose test file is gone, which fail a plain run of Jest too, and names each once, sorted, though Jest lists one per project', () => {
    expect(
      readTeardown(
        {
          obsolete: [
            '/p/test/__snapshots__/b.test.js.snap',
            '/p/test/__snapshots__/a.test.js.snap',
            '/p/test/__snapshots__/b.test.js.snap',
          ],
          how: 'exited with code 1',
          finished: true,
          stopped: false,
          early: false,
          output: '',
          code: 1,
        },
        '/p',
      ),
    ).toStrictEqual([
      {
        message:
          'Jest found snapshot files whose test file is gone, which fails a plain run of Jest too: test/__snapshots__/a.test.js.snap, test/__snapshots__/b.test.js.snap; remove them, or run jest -u.',
        code: 'teardown-failed',
        severity: 'error',
        column: null,
        file: null,
        line: null,
      },
    ])
  })

  it('fails the run with the output of a host that failed before its results processor', () => {
    expect(
      readTeardown(
        {
          output: 'Error: the database is gone\n',
          how: 'exited with code 1',
          finished: false,
          stopped: false,
          obsolete: [],
          early: false,
          code: 1,
        },
        '/p',
      ),
    ).toStrictEqual([
      {
        message:
          'Jest exited with code 1 in global teardown or the test sequencer, which fails a plain run of Jest too; its last output:\nError: the database is gone\n',
        code: 'teardown-failed',
        severity: 'error',
        column: null,
        file: null,
        line: null,
      },
    ])
  })

  it('fails the run of a host that had exited before close, which never ran global teardown', () => {
    expect(
      readTeardown(
        {
          output: 'Error: the server is gone\n',
          how: 'exited with code 1',
          finished: false,
          stopped: false,
          obsolete: [],
          early: true,
          code: 1,
        },
        '/p',
      ),
    ).toStrictEqual([
      {
        message:
          'The Jest process that ran global setup exited with code 1 before the run ended, so global teardown did not run, and what global setup started went with it; its last output:\nError: the server is gone\n',
        code: 'teardown-failed',
        severity: 'error',
        column: null,
        file: null,
        line: null,
      },
    ])
  })

  it('warns of a global teardown that did not end in time, whatever the exit', () => {
    expect(
      readTeardown(
        {
          how: 'was stopped by SIGKILL',
          finished: false,
          stopped: true,
          obsolete: [],
          early: false,
          output: '',
          code: null,
        },
        '/p',
      ),
    ).toMatchObject([
      {
        message:
          "Jest's global teardown did not end in time, so mootant stopped it; a plain run of Jest would wait for it.",
        code: 'teardown-failed',
        severity: 'warning',
      },
    ])
  })
})
