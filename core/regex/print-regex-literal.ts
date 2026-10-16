/**
 * Prints a regular expression literal. An empty pattern is printed as `(?:)`,
 * because `//` would start a comment.
 *
 * @param pattern - Text between the slashes.
 * @param flags - Flags after the closing slash, such as `gi`.
 * @returns Source text of the literal.
 */
export function printRegexLiteral(pattern: string, flags: string): string {
  return `/${pattern === '' ? '(?:)' : pattern}/${flags}`
}
