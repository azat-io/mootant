/**
 * Writes text as inline code of Markdown. The fence has one backtick more than
 * the longest run of backticks in the text. Text that starts or ends with a
 * backtick, or has a space at both ends, gets one more space inside the fence,
 * which CommonMark strips. Empty text and code spans written next to each other
 * have no Markdown form.
 *
 * @param text - Code to write.
 * @returns Markdown of the code with its fences.
 */
export function toInlineCode(text: string): string {
  let runs = text.match(/`+/gu) ?? []
  let fence = '`'.repeat(Math.max(0, ...runs.map(run => run.length)) + 1)
  let spaced = text.startsWith(' ') && text.endsWith(' ') && text.trim() !== ''
  let padding = spaced || text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${padding}${text}${padding}${fence}`
}
