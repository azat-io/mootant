import { isatty } from 'node:tty'

/**
 * Checks whether the spinner may animate its row in place.
 *
 * Standard error, where progress goes, has to be a terminal that understands
 * cursor movement, and the process must not run in CI. Standard output does not
 * matter: a report piped to a file or another program, such as with `--json`,
 * still shows live progress in the terminal. A `CI` variable counts even when
 * it is empty.
 *
 * @returns True when the spinner may redraw its row.
 */
export function isInteractiveTerminal(): boolean {
  return isatty(2) && process.env['TERM'] !== 'dumb' && !('CI' in process.env)
}
