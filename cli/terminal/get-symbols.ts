/**
 * Marks text reports print.
 */
export interface Symbols {
  /**
   * Ends a text cut to fit.
   */
  ellipsis: string

  /**
   * Marks a warning.
   */
  warning: string

  /**
   * Marks a failure or an error.
   */
  cross: string

  /**
   * Separates the original and the replacement of a change.
   */
  arrow: string

  /**
   * Marks a success.
   */
  check: string

  /**
   * Starts the header of a report.
   */
  dot: string
}

/**
 * Picks the marks of text reports: Unicode symbols where the terminal shows
 * them, ASCII elsewhere.
 *
 * @param unicode - Whether the terminal shows Unicode.
 * @returns Marks to print.
 */
export function getSymbols(unicode: boolean): Symbols {
  return unicode ?
      {
        ellipsis: '…',
        warning: '▲',
        cross: '✖',
        arrow: '→',
        check: '✔',
        dot: '●',
      }
    : {
        ellipsis: '...',
        warning: '!',
        arrow: '->',
        cross: 'x',
        check: '+',
        dot: '*',
      }
}
