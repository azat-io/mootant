/**
 * Tells whether text written as it is between the backticks of a `String.raw`
 * template gives itself back: it has no carriage return, which the template
 * reads as a line feed, no backtick or `${` that is not escaped, and does not
 * end with a backslash that would escape the closing backtick. A backslash
 * keeps the character after it in the raw text, so an escaped backtick or `$`
 * stays as it is.
 *
 * @param text - Candidate text between the backticks.
 * @returns Whether the template would hold exactly the text.
 */
export function isRawTemplateText(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    switch (text[index]) {
      case '\\':
        if (index === text.length - 1 || text[index + 1] === '\r') {
          return false
        }
        index += 1
        break
      case '\r':
      case '`':
        return false
      case '$':
        if (text[index + 1] === '{') {
          return false
        }
        break
      default:
        break
    }
  }
  return true
}
