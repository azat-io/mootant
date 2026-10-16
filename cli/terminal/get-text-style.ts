import type { TextStyle } from '../../types/cli/text-style'

import { isUnicodeSupported } from './is-unicode-supported'
import { isColorSupported, createColors } from './colors'

/**
 * Width assumed for a terminal that does not report one.
 */
const DEFAULT_COLUMNS = 80

/**
 * Decides how text looks on a stream: colors by the rules of `isColorSupported`
 * applied to that stream, the width of a terminal, or no limit for a file or a
 * pipe, and Unicode symbols where the terminal shows them.
 *
 * @param stream - Standard output or standard error.
 * @param stream.columns - Width of the terminal, if any.
 * @param stream.isTTY - Whether the stream is a terminal.
 * @returns Style of the text printed to the stream.
 */
export function getTextStyle(stream: {
  columns?: number
  isTTY?: boolean
}): TextStyle {
  let { platform, argv, env } = process
  let width = Infinity
  if (stream.isTTY === true) {
    width = (stream.columns ?? 0) > 0 ? stream.columns! : DEFAULT_COLUMNS
  }
  return {
    colors: createColors(
      isColorSupported({ stdout: stream, platform, argv, env }),
    ),
    unicode: isUnicodeSupported(),
    width,
  }
}
