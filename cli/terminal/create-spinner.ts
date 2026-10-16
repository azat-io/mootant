import type { ColorName, Color } from './colors'

import { isInteractiveTerminal } from './is-interactive-terminal'
import { isUnicodeSupported } from './is-unicode-supported'
import { countTerminalRows } from './count-terminal-rows'

/**
 * Delay between two frames of the animation, in milliseconds.
 */
const FRAME_INTERVAL = 80

/**
 * Frames of the animation in a terminal that shows Unicode.
 */
const UNICODE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/**
 * Frames of the animation in a terminal limited to ASCII.
 */
const ASCII_FRAMES = ['-', '\\', '|', '/']

/**
 * Hides the cursor while the spinner animates.
 */
const HIDE_CURSOR = '\u{1B}[?25l'

/**
 * Shows the cursor again once the spinner stops.
 */
const SHOW_CURSOR = '\u{1B}[?25h'

/**
 * Moves the cursor to the first column of its row.
 */
const MOVE_TO_LINE_START = '\u{1B}[1G'

/**
 * Erases the row of the cursor and moves the cursor to its first column.
 */
const ERASE_LINE = '\u{1B}[2K\u{1B}[1G'

/**
 * Moves the cursor one row up.
 */
const MOVE_UP = '\u{1B}[1A'

/**
 * Signals that end the process while the spinner runs, with the exit codes a
 * shell reports for them.
 */
const SIGNAL_EXIT_CODES: [signal: NodeJS.Signals, code: number][] = [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]

/**
 * Progress line that the CLI shows on standard error while a command works.
 */
export interface Spinner {
  /**
   * Prints a line above the animation, which goes on below it. Outside an
   * interactive terminal the line is simply printed.
   *
   * @param line - Text without a trailing line break.
   */
  print(line: string): void

  /**
   * Starts the animation.
   *
   * @returns The same spinner, so that creating and starting it chain.
   */
  start(): Spinner

  /**
   * Erases the animation and shows the cursor. Safe to call twice.
   */
  stop(): void
}

/**
 * Creates a spinner that writes to standard error.
 *
 * In an interactive terminal the spinner redraws its row every 80 ms with the
 * cursor hidden, asking for its text on every frame, so the text may show a
 * live clock. Elsewhere it never animates: only the lines given to `print` are
 * written. While it runs, SIGINT and SIGTERM erase it and show the cursor
 * before the process exits.
 *
 * @param text - Gives the text next to the animation; called on every frame.
 * @param colors - Color functions of the CLI.
 * @returns Controls of the spinner.
 */
export function createSpinner(
  text: () => string,
  colors: Record<ColorName, Color>,
): Spinner {
  let stream = process.stderr
  let isInteractive = isInteractiveTerminal()
  let frames = isUnicodeSupported() ? UNICODE_FRAMES : ASCII_FRAMES
  let frameIndex = 0
  let rows = 0
  let running = false
  let timer: NodeJS.Timeout | undefined
  let signalListeners: [signal: NodeJS.Signals, listener: () => void][] = []

  /**
   * Builds the sequence that erases every row of the last frame, from the row
   * of the cursor up.
   *
   * @returns Escape sequence to write before the next output.
   */
  function erase(): string {
    let sequence = MOVE_TO_LINE_START
    for (let row = 0; row < rows; row++) {
      sequence += row === 0 ? ERASE_LINE : `${MOVE_UP}${ERASE_LINE}`
    }
    rows = 0
    return sequence
  }

  /**
   * Builds the current frame.
   *
   * @returns Text of the frame, without a line break.
   */
  function getFrame(): string {
    return `${colors.greenBright(frames[frameIndex])} ${text()}`
  }

  /**
   * Draws the current frame and plans the next one.
   */
  function render(): void {
    let frame = getFrame()
    timer = setTimeout(render, FRAME_INTERVAL)
    stream.write(`${HIDE_CURSOR}${erase()}${frame}`)
    rows = countTerminalRows(frame, stream.columns)
    frameIndex = (frameIndex + 1) % frames.length
  }

  let spinner: Spinner = {
    start() {
      if (!isInteractive) {
        return spinner
      }
      for (let [signal, code] of SIGNAL_EXIT_CODES) {
        let listener: () => void
        /**
         * The listener is written right in the call: unicorn/no-process-exit
         * allows `process.exit()` only in a handler passed to `process.on()`.
         */
        process.on(
          signal,
          (listener = () => {
            spinner.stop()
            process.exit(code)
          }),
        )
        signalListeners.push([signal, listener])
      }
      running = true
      render()
      return spinner
    },
    stop() {
      clearTimeout(timer)
      for (let [signal, listener] of signalListeners) {
        process.off(signal, listener)
      }
      signalListeners = []
      if (running) {
        running = false
        stream.write(`${erase()}${SHOW_CURSOR}`)
      }
    },
    print(line) {
      if (!running) {
        stream.write(`${line}\n`)
        return
      }
      let frame = getFrame()
      stream.write(`${erase()}${line}\n${frame}`)
      rows = countTerminalRows(frame, stream.columns)
    },
  }

  return spinner
}
