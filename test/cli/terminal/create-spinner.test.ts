import type { MockInstance } from 'vitest'

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { isInteractiveTerminal } from '../../../cli/terminal/is-interactive-terminal'
import { isUnicodeSupported } from '../../../cli/terminal/is-unicode-supported'
import { createSpinner } from '../../../cli/terminal/create-spinner'
import { createColors } from '../../../cli/terminal/colors'

vi.mock(import('../../../cli/terminal/is-interactive-terminal'))
vi.mock(import('../../../cli/terminal/is-unicode-supported'))

/**
 * Colors turned on, so every test checks the same output everywhere.
 */
let colors = createColors(true)

/**
 * Hides the cursor.
 */
const HIDE_CURSOR = '\u{1B}[?25l'

/**
 * Shows the cursor.
 */
const SHOW_CURSOR = '\u{1B}[?25h'

/**
 * Moves the cursor to the first column.
 */
const LINE_START = '\u{1B}[1G'

/**
 * Erases the row and moves the cursor to its first column.
 */
const ERASE_LINE = '\u{1B}[2K\u{1B}[1G'

/**
 * Moves the cursor one row up.
 */
const MOVE_UP = '\u{1B}[1A'

/**
 * Real descriptor of the width of standard error, restored after every test.
 */
let realColumns = Object.getOwnPropertyDescriptor(process.stderr, 'columns')

/**
 * Sets the width standard error reports.
 *
 * @param columns - Width to report, or undefined for none.
 */
function setColumns(columns: undefined | number): void {
  Object.defineProperty(process.stderr, 'columns', {
    configurable: true,
    value: columns,
  })
}

describe('createSpinner', () => {
  let writeSpy: MockInstance<typeof process.stderr.write>
  let exitSpy: MockInstance<typeof process.exit>
  let onSpy: MockInstance<typeof process.on>

  /**
   * Everything written to standard error since the last check.
   *
   * @returns Output, and nothing for the next call.
   */
  function takeOutput(): string {
    let output = writeSpy.mock.calls.map(([chunk]) => String(chunk)).join('')
    writeSpy.mockClear()
    return output
  }

  /**
   * Sends a signal to the listener the spinner registered for it.
   *
   * @param signal - Signal to send.
   */
  function sendSignal(signal: NodeJS.Signals): void {
    let [, listener] = onSpy.mock.calls.find(([event]) => event === signal)!
    listener(signal)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(isInteractiveTerminal).mockReturnValue(true)
    vi.mocked(isUnicodeSupported).mockReturnValue(true)
    writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)
    onSpy = vi.spyOn(process, 'on')
    setColumns(80)
  })

  afterEach(() => {
    if (realColumns) {
      Object.defineProperty(process.stderr, 'columns', realColumns)
    } else {
      Reflect.deleteProperty(process.stderr, 'columns')
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('draws the first frame with the cursor hidden', () => {
    let spinner = createSpinner(() => 'dry run', colors).start()

    expect(takeOutput()).toBe(
      `${HIDE_CURSOR}${LINE_START}${colors.greenBright('⠋')} dry run`,
    )

    spinner.stop()
  })

  it('redraws its row every 80 ms with the next frame and fresh text', () => {
    let count = 0
    let spinner = createSpinner(() => `${count++}`, colors).start()
    takeOutput()

    vi.advanceTimersByTime(240)

    expect(takeOutput()).toBe(
      [...'⠙⠹⠸']
        .map(
          (frame, index) =>
            `${HIDE_CURSOR}${LINE_START}${ERASE_LINE}${colors.greenBright(frame)} ${index + 1}`,
        )
        .join(''),
    )

    spinner.stop()
  })

  it('prints a line above the frame and draws the frame again', () => {
    let spinner = createSpinner(() => 'testing', colors).start()
    takeOutput()

    spinner.print('note')

    expect(takeOutput()).toBe(
      `${LINE_START}${ERASE_LINE}note\n${colors.greenBright('⠙')} testing`,
    )

    spinner.stop()
  })

  it('erases the frame, shows the cursor and stops once', () => {
    let spinner = createSpinner(() => 'testing', colors).start()
    takeOutput()

    spinner.stop()
    spinner.stop()
    vi.advanceTimersByTime(500)

    expect(takeOutput()).toBe(`${LINE_START}${ERASE_LINE}${SHOW_CURSOR}`)
  })

  it('uses ASCII frames when the terminal cannot show Unicode', () => {
    vi.mocked(isUnicodeSupported).mockReturnValue(false)

    let spinner = createSpinner(() => 'x', colors).start()
    vi.advanceTimersByTime(240)
    spinner.stop()

    expect(takeOutput()).toBe(
      [
        `${HIDE_CURSOR}${LINE_START}${colors.greenBright('-')} x`,
        `${HIDE_CURSOR}${LINE_START}${ERASE_LINE}${colors.greenBright('\\')} x`,
        `${HIDE_CURSOR}${LINE_START}${ERASE_LINE}${colors.greenBright('|')} x`,
        `${HIDE_CURSOR}${LINE_START}${ERASE_LINE}${colors.greenBright('/')} x`,
        `${LINE_START}${ERASE_LINE}${SHOW_CURSOR}`,
      ].join(''),
    )
  })

  it('erases every row of a frame that a narrow terminal wraps', () => {
    setColumns(20)

    let spinner = createSpinner(() => 'testing 569 mutants  3/569', colors)
    spinner.start()
    takeOutput()
    vi.advanceTimersByTime(80)

    expect(takeOutput()).toBe(
      `${HIDE_CURSOR}${LINE_START}${ERASE_LINE}${MOVE_UP}${ERASE_LINE}${colors.greenBright('⠙')} testing 569 mutants  3/569`,
    )

    spinner.print('note')

    expect(takeOutput()).toBe(
      `${LINE_START}${ERASE_LINE}${MOVE_UP}${ERASE_LINE}note\n${colors.greenBright('⠹')} testing 569 mutants  3/569`,
    )

    spinner.stop()
  })

  it('never animates outside an interactive terminal, only prints lines', () => {
    vi.mocked(isInteractiveTerminal).mockReturnValue(false)
    let interrupts = process.listenerCount('SIGINT')

    let spinner = createSpinner(() => 'testing', colors).start()
    vi.advanceTimersByTime(500)
    spinner.print('done')
    spinner.stop()

    expect(takeOutput()).toBe('done\n')
    expect(process.listenerCount('SIGINT')).toBe(interrupts)
  })

  it('listens to SIGINT and SIGTERM only while it runs', () => {
    let interrupts = process.listenerCount('SIGINT')
    let terminations = process.listenerCount('SIGTERM')

    let spinner = createSpinner(() => 'testing', colors).start()

    expect(process.listenerCount('SIGINT')).toBe(interrupts + 1)
    expect(process.listenerCount('SIGTERM')).toBe(terminations + 1)

    spinner.stop()

    expect(process.listenerCount('SIGINT')).toBe(interrupts)
    expect(process.listenerCount('SIGTERM')).toBe(terminations)
  })

  it.each([
    { signal: 'SIGINT', code: 130 },
    { signal: 'SIGTERM', code: 143 },
  ] as const)(
    'erases the frame, shows the cursor and exits with $code on $signal',
    ({ signal, code }) => {
      createSpinner(() => 'testing', colors).start()
      takeOutput()

      sendSignal(signal)

      expect(takeOutput()).toBe(`${LINE_START}${ERASE_LINE}${SHOW_CURSOR}`)
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(code)
    },
  )
})
