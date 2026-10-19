// spell-checker:ignore survi
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

  /**
   * Builds the start of a run of the test runner whose units each cost a second
   * and have test files of their own.
   *
   * @param fields - Fields that differ.
   * @returns The event.
   */
  function startRun(
    fields: Partial<Extract<RunEvent, { kind: 'run-start' }>> = {},
  ): Extract<RunEvent, { kind: 'run-start' }> {
    let units = fields.units ?? 12
    return {
      chains: Array.from({ length: units }, (_, index) => index),
      costs: Array.from({ length: units }, () => 1000),
      kind: 'run-start',
      run: 'isolated',
      mutants: 12,
      workers: 1,
      round: 1,
      ...fields,
      units,
    }
  }

  /**
   * Builds the end of a unit.
   *
   * @param unit - Index of the unit, or null.
   * @returns The event.
   */
  function endUnit(unit: number | null = null): RunEvent {
    return { kind: 'unit-end', duration: null, unit }
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
      [300, endUnit()],
    ])
    texts.push(getText())
    feed(progress, [[100, { kind: 'dry-end', duration: 400, tests: 5 }]])
    texts.push(getText())
    feed(progress, [
      [50, startRun()],
      [1000, endUnit(0)],
      [1000, endUnit(1)],
    ])
    texts.push(getText())
    feed(progress, [[1000, endUnit(2)]])
    texts.push(getText())
    now += 4000
    texts.push(getText())
    progress.finish()
    progress.finish()

    expect(texts).toStrictEqual([
      'preparing  0.0s',
      'preparing 12 mutants  0.1s',
      'dry run  1 test file · 0.3s',
      'planning  0.0s',
      'testing 12 mutants  2/12 test runs · 2.0s',
      'testing 12 mutants  3/12 test runs · 3.0s · ~10s left in round',
      'testing 12 mutants  3/12 test runs · 7.0s · ~5s left in round',
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
      progress.handle(startRun({ units: 9, mutants, round, run }))
      return getText()
    })
    vi.mocked(createSpinner).mockClear()
    let narrow = createRunProgress(createTextStyle({ width: 40 }), false)
    let shorts = runs.map(([run, round, mutants]) => {
      narrow.handle(startRun({ units: 9, mutants, round, run }))
      return getText()
    })

    expect(texts).toStrictEqual([
      'batch testing 4 mutants  0/9 test runs · 0.0s',
      'batch testing 1 survivor with more tests  0/9 test runs · 0.0s',
      'recovering 2 mutants of lost batch tries  0/9 test runs · 0.0s',
      'confirming 1 timeout  0/9 test runs · 0.0s',
      'testing 1 mutant  0/9 test runs · 0.0s',
      'testing 3 survivors with more test files  0/9 test runs · 0.0s',
      'testing 2 survivors with more test files  0/9 test runs · 0.0s',
    ])
    expect(shorts).toStrictEqual([
      'batch 4 mutants  0/9',
      'batch round 2: 1 survivor  0/9',
      'recovering 2 mutants  0/9',
      'confirming 1  0/9',
      '1 mutant  0/9',
      'round 2: 3 survivors  0/9',
      'round 3: 2 survivors  0/9',
    ])
  })

  it('counts decided mutants in runs and marks the time left of a round', () => {
    let progress = createRunProgress(createTextStyle({ colors: true }), false)

    feed(progress, [
      [0, { kind: 'verdicts', survived: 0, timeout: 0, killed: 3, error: 0 }],
    ])
    let planning = getText()
    feed(progress, [
      [0, startRun()],
      [1000, endUnit(0)],
      [0, { kind: 'verdicts', survived: 2, killed: 120, timeout: 1, error: 4 }],
      [1000, endUnit(1)],
      [1000, endUnit(2)],
    ])

    expect(showEscapes(planning)).toBe('preparing  <90>0.0s<39>')
    expect(showEscapes(getText())).toBe(
      'testing 12 mutants  <90>3/12 test runs<39> · <90>killed 120<39> · <90>survived<39> <92>2<39> · <90>timeout 1<39> · <90>error<39> <31>4<39> · <90>3.0s<39> · <90>~10s left in round<39>',
    )

    feed(progress, [
      [0, { kind: 'verdicts', survived: 0, timeout: 0, killed: 5, error: 0 }],
    ])

    expect(showEscapes(getText())).toBe(
      'testing 12 mutants  <90>3/12 test runs<39> · <90>killed 5<39> · <90>survived<39> <90>0<39> · <90>3.0s<39> · <90>~10s left in round<39>',
    )
  })

  it('leaves parts out of the line instead of wrapping it', () => {
    let texts = [80, 60, 50, 40, 30, 20].map(width => {
      now = 1000
      vi.mocked(createSpinner).mockClear()
      let progress = createRunProgress(createTextStyle({ width }), false)
      feed(progress, [
        [
          0,
          { kind: 'verdicts', survived: 14, killed: 120, timeout: 2, error: 1 },
        ],
        [0, startRun({ round: 2 })],
        [1000, endUnit(0)],
        [1000, endUnit(1)],
        [1000, endUnit(2)],
      ])
      return getText()
    })

    expect(texts).toStrictEqual([
      'round 2: 12 survivors  3/12 · killed 120 · survived 14 · ~10s left',
      'round 2: 12 survivors  3/12 · survived 14 · ~10s left',
      'round 2: 12 survivors  3/12 · survived 14',
      'round 2: 12 survivors  3/12',
      'round 2: 12 survivors  3/12',
      'round 2: 12 survi…',
    ])
    for (let [index, width] of [80, 60, 50, 40, 30, 20].entries()) {
      expect(texts[index]!.length).toBeLessThanOrEqual(width - 2)
    }
  })

  it('keeps the time left of a large run and the same parts as counts grow', () => {
    let texts = [100, 80, 60].map(width => {
      now = 1000
      vi.mocked(createSpinner).mockClear()
      let progress = createRunProgress(createTextStyle({ width }), false)
      let shown: string[] = []
      feed(progress, [
        [0, { kind: 'mutants', total: 1450, ignored: 0, files: 9 }],
        [0, { kind: 'verdicts', survived: 0, timeout: 0, killed: 0, error: 0 }],
        [
          0,
          startRun({
            chains: Array.from({ length: 4980 }, (_, index) => index % 60),
            costs: Array.from({ length: 4980 }, () => 400),
            mutants: 1450,
            units: 4980,
            workers: 4,
          }),
        ],
      ])
      shown.push(getText())
      for (let unit = 0; unit < 2210; unit++) {
        feed(progress, [[100, { kind: 'unit-end', duration: 380, unit }]])
        if (unit === 8) {
          feed(progress, [
            [
              0,
              {
                kind: 'verdicts',
                survived: 1,
                timeout: 0,
                killed: 7,
                error: 0,
              },
            ],
          ])
          shown.push(getText())
        }
      }
      feed(progress, [
        [
          0,
          {
            kind: 'verdicts',
            survived: 145,
            killed: 1203,
            timeout: 0,
            error: 0,
          },
        ],
      ])
      shown.push(getText())
      return shown
    })

    expect(texts).toStrictEqual([
      [
        'testing 1450 mutants  0/4980 test runs · killed 0 · survived 0',
        'testing 1450 mutants  9/4980 test runs · killed 7 · survived 1',
        'testing 1450 mutants  2210/4980 test runs · killed 1203 · survived 145 · ~4m 40s left in round',
      ],
      [
        '1450 mutants  0/4980 · killed 0 · survived 0',
        '1450 mutants  9/4980 · killed 7 · survived 1',
        '1450 mutants  2210/4980 · killed 1203 · survived 145 · ~4m 40s in round',
      ],
      [
        '1450 mutants  0/4980 · survived 0',
        '1450 mutants  9/4980 · survived 1',
        '1450 mutants  2210/4980 · survived 145 · ~4m 40s in round',
      ],
    ])
  })

  it('hides the time left once every unit ended or its end passed', () => {
    let progress = createRunProgress(createTextStyle(), false)
    feed(progress, [
      [0, startRun({ units: 4 })],
      [1000, endUnit(0)],
      [1000, endUnit(1)],
      [1000, endUnit(2)],
    ])
    let texts = [getText()]
    now += 1500
    texts.push(getText())
    feed(progress, [[1000, endUnit(3)]])
    texts.push(getText())

    expect(texts).toStrictEqual([
      'testing 12 mutants  3/4 test runs · 3.0s · ~5s left in round',
      'testing 12 mutants  3/4 test runs · 4.5s',
      'testing 12 mutants  4/4 test runs · 5.5s',
    ])
  })

  it('follows the width of the terminal as it changes', () => {
    Object.defineProperty(process.stderr, 'columns', {
      configurable: true,
      value: 40,
    })
    let progress = createRunProgress(createTextStyle({ width: 200 }), false)
    feed(progress, [[0, startRun()]])
    let text = getText()
    Reflect.deleteProperty(process.stderr, 'columns')

    expect(text).toBe('12 mutants  0/12')
  })

  it('prints a line per finished phase outside a terminal', () => {
    vi.mocked(isInteractiveTerminal).mockReturnValue(false)
    let progress = createRunProgress(createTextStyle({ colors: true }), false)

    feed(progress, [
      [0, { kind: 'mutants', ignored: 0, total: 3, files: 1 }],
      [0, { kind: 'dry-start', files: 1 }],
      [400, { kind: 'dry-end', duration: 400, tests: 1 }],
      [0, { kind: 'verdicts', survived: 0, timeout: 0, killed: 0, error: 0 }],
      [0, startRun({ run: 'batch', mutants: 3, units: 1 })],
      [0, { kind: 'verdicts', survived: 0, timeout: 0, killed: 2, error: 0 }],
      [200, endUnit()],
      [0, startRun({ mutants: 1, units: 1 })],
      [100, endUnit()],
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
