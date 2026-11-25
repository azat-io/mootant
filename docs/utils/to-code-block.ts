/**
 * Writes a fenced code block of Markdown. The fence has one backtick more than
 * the longest run of three or more backticks in the code.
 *
 * @param code - Code to write.
 * @param language - Language of the code, such as `sh`.
 * @returns Markdown of the block with its fences.
 */
export function toCodeBlock(code: string, language: string): string {
  let runs = code.match(/`{3,}/gu) ?? []
  let fence = '`'.repeat(Math.max(2, ...runs.map(run => run.length)) + 1)
  return `${fence}${language}\n${code.trimEnd()}\n${fence}`
}
