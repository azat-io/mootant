import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import type { RunEvent } from '../../types/run/run-event'

import { isInteractiveTerminal } from '../../cli/terminal/is-interactive-terminal'
import { createRunProgress } from '../../cli/create-run-progress'
import { createSpinner } from '../../cli/terminal/create-spinner'
import { createTextStyle } from '../helpers/create-text-style'
import { showEscapes } from '../helpers/show-escapes'

vi.mock(import('../../cli/terminal/is-interactive-terminal'))
vi.mock(import('../../cli/terminal/create-spinner'))

describe('createRunProgress', () => {
  let now = 0
  let lines: string[] = []
  let stops = 0

  /**
   * Text the spinner would show now.
   *
   * @returns Text next to the animation.
   */
  function getText(): string {
    return vi.mocked(createSpinner).mock.calls[0]![0]()
  }

  /**
   * Feeds events to a progress, moving the clock before each.
   *
   * @param progress - Progress to feed.
   * @param steps - Milliseconds to wait and the event that comes then.
   */
  function feed(
    progress: ReturnType<typeof createRunProgress>,
    steps: [wait: number, event: RunEvent][],
  ): void {
    for (let [wait, event] of steps) {
      now += wait
      progress.handle(event)
    }
  }

  beforeEach(() => {
    now = 1000
    lines = []
    stops = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.mocked(isInteractiveTerminal).mockReturnValue(true)
    vi.mocked(createSpinner).mockImplementation(() => {
      let spinner = {
        print: (line: string) => {
          lines.push(line)
        },
        stop: () => {
          stops += 1
        },
        start: () => spinner,
      }
      return spinner
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the phase, units, time and time left in a terminal', () => {
    let progress = createRunProgress(createTextStyle(), false)
    let texts = [getText()]

    feed(progress, [
      [100, { kind: 'mutants', ignored: 1, total: 12, files: 2 }],
    ])
    texts.push(getText())
    feed(progress, [
      [100, { kind: 'dry-start', files: 2 }],
      [300, { kind: 'unit-end' }],
    ])
    texts.push(getText())
    feed(progress, [[100, { kind: 'dry-end', duration: 400, tests: 5 }]])
    texts.push(getText())
    feed(progress, [
      [
        50,
        {
          kind: 'run-start',
          run: 'isolated',
          mutants: 12,
          units: 12,
          round: 1,
        },
      ],
      [1000, { kind: 'unit-end' }],
      [1000, { kind: 'unit-end' }],
    ])
    texts.push(getText())
    feed(progress, [[1000, { kind: 'unit-end' }]])
    texts.push(getText())
    progress.finish()
    progress.finish()

    expect(texts).toStrictEqual([
      'preparing  0.0s',
      'preparing 12 mutants  0.1s',
      'dry run  1 test file · 0.3s',
      'planning  0.0s',
      'testing 12 mutants  2/12 test runs · 2.0s',
      'testing 12 mutants  3/12 test runs · 3.0s · ~9.0s left',
    ])
    expect(lines).toStrictEqual([])
    expect(stops).toBe(1)
  })

  it('names every run of the test runner', () => {
    let progress = createRunProgress(createTextStyle(), false)
    let runs: [
      Extract<RunEvent, { kind: 'run-start' }>['run'],
      number,
      number,
    ][] = [
      ['batch', 1, 4],
      ['batch', 2, 1],
      ['recovery', 1, 2],
      ['confirmation', 1, 1],
      ['isolated', 1, 1],
      ['isolated', 2, 3],
      ['isolated', 3, 2],
    ]
    let texts = runs.map(([run, round, mutants]) => {
      progress.handle({ kind: 'run-start', units: 9, mutants, round, run })
      return getText()
    })

    expect(texts).toStrictEqual([
      'batch testing 4 mutants  0/9 test runs · 0.0s',
      'batch testing 1 survivor with more tests  0/9 test runs · 0.0s',
      'recovering 2 mutants of lost batch tries  0/9 test runs · 0.0s',
      'confirming 1 timeout  0/9 test runs · 0.0s',
      'testing 1 mutant  0/9 test runs · 0.0s',
      'testing 3 survivors with more test files  0/9 test runs · 0.0s',
      'retrying 2 mutants  0/9 test runs · 0.0s',
    ])
  })

  it('prints a line per finished phase outside a terminal', () => {
    vi.mocked(isInteractiveTerminal).mockReturnValue(false)
    let progress = createRunProgress(createTextStyle({ colors: true }), false)

    feed(progress, [
      [0, { kind: 'mutants', ignored: 0, total: 3, files: 1 }],
      [0, { kind: 'dry-start', files: 1 }],
      [400, { kind: 'dry-end', duration: 400, tests: 1 }],
      [0, { kind: 'run-start', run: 'batch', mutants: 3, round: 1, units: 1 }],
      [200, { kind: 'unit-end' }],
      [
        0,
        { kind: 'run-start', run: 'isolated', mutants: 1, round: 1, units: 1 },
      ],
      [100, { kind: 'unit-end' }],
    ])
    progress.finish()

    expect(lines.map(line => showEscapes(line))).toStrictEqual([
      '<32>✔<39> dry run  <90>1 test in 0.4s<39>',
      '<32>✔<39> batch testing 3 mutants  <90>1/1 test runs in 0.2s<39>',
      '<32>✔<39> testing 1 mutant  <90>1/1 test runs in 0.1s<39>',
    ])
  })

  it('keeps what the tests write by test file, or prints it when verbose, and prints notes', () => {
    let quiet = createRunProgress(createTextStyle(), false)
    feed(quiet, [
      [0, { text: '(node) Warning: x\n', kind: 'output', file: null }],
      [0, { file: 'test/b.test.ts', kind: 'output', text: 'b\n' }],
      [0, { message: '2 tests are not repeatable.', kind: 'note' }],
      [0, { file: 'test/a.test.ts', kind: 'output', text: 'a' }],
      [0, { file: 'test/b.test.ts', text: 'more b\n', kind: 'output' }],
      [0, { file: 'test/c.test.ts', kind: 'output', text: '  \n' }],
    ])

    expect(quiet.output()).toBe(
      'test/a.test.ts\na\n\ntest/b.test.ts\nb\nmore b\n\nother output\n(node) Warning: x',
    )
    expect(lines).toStrictEqual(['2 tests are not repeatable.'])

    let verbose = createRunProgress(createTextStyle(), true)
    feed(verbose, [[0, { kind: 'output', text: 'log\n', file: null }]])

    expect(verbose.output()).toBe('')
    expect(lines).toStrictEqual(['2 tests are not repeatable.', 'log'])
  })

  it('keeps only the output of the last dry run and of the files that failed', () => {
    let progress = createRunProgress(createTextStyle({ colors: true }), false)
    feed(progress, [
      [0, { kind: 'dry-start', files: 2 }],
      [0, { file: 'test/fail.test.ts', text: 'first\n', kind: 'output' }],
      [0, { message: 'Some tests failed; checking.', kind: 'dry-again' }],
      [0, { file: 'test/fail.test.ts', text: 'second\n', kind: 'output' }],
      [0, { file: 'test/pass.test.ts', kind: 'output', text: 'pass\n' }],
      [0, { text: 'warning\n', kind: 'output', file: null }],
      [
        0,
        {
          files: ['test/fail.test.ts', 'test/quiet.test.ts'],
          kind: 'dry-failed',
        },
      ],
    ])

    expect(showEscapes(progress.output())).toBe(
      '<1>test/fail.test.ts<22>\nsecond\n\n<1>other output<22>\nwarning',
    )
    expect(lines.map(line => showEscapes(line))).toStrictEqual([
      '<90>Some tests failed; checking.<39>',
    ])
  })

  it('keeps only the last 100 000 characters of output per test file', () => {
    let progress = createRunProgress(createTextStyle(), false)
    feed(progress, [
      [0, { text: 'a'.repeat(100_000), kind: 'output', file: null }],
      [0, { kind: 'output', file: null, text: 'b' }],
    ])

    expect(progress.output()).toBe(`other output\n${'a'.repeat(99_999)}b`)
  })
})
