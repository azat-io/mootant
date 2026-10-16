import { describe, expect, it } from 'vitest'

import { createOutputReporter } from '../../../adapters/vitest/create-output-reporter'

describe('createOutputReporter', () => {
  it('hands console calls on with the test file of their task', async () => {
    let output: [string, string | null][] = []
    let vitest: ReturnType<Parameters<typeof createOutputReporter>[1]> = null
    let reporter = createOutputReporter(
      (text, file) => {
        output.push([text, file])
      },
      () => vitest,
    )

    await reporter.onUserConsoleLog!({
      content: 'early\n',
      type: 'stdout',
      taskId: 't1',
      time: 0,
      size: 1,
    })
    vitest = {
      state: {
        idMap: new Map([['t1', { file: { filepath: '/p/test/a.test.ts' } }]]),
      },
    }
    await reporter.onUserConsoleLog!({
      content: 'log\n',
      type: 'stdout',
      taskId: 't1',
      time: 0,
      size: 1,
    })
    await reporter.onUserConsoleLog!({
      content: 'lost\n',
      type: 'stderr',
      taskId: 't2',
      time: 0,
      size: 1,
    })
    await reporter.onUserConsoleLog!({
      content: 'top\n',
      type: 'stdout',
      time: 0,
      size: 1,
    })

    expect(output).toStrictEqual([
      ['early\n', null],
      ['log\n', '/p/test/a.test.ts'],
      ['lost\n', null],
      ['top\n', null],
    ])
  })
})
