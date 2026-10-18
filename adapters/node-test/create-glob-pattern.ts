/**
 * Turns a glob into a regular expression that matches relative paths with `/`
 * separators: `**` as a whole segment matches any number of directories, `*`
 * any characters but `/`, `?` one such character, `{a,b}` either text and
 * `[...]` a character class (`[!...]` negated); other characters, and brackets
 * and braces that are not closed, match themselves.
 *
 * @param glob - Glob, such as `test/**\/*.test.{js,ts}`.
 * @returns Regular expression of the whole path.
 */
export function createGlobPattern(glob: string): RegExp {
  let source = ''
  let braces = 0
  for (let index = 0; index < glob.length; index++) {
    let character = glob[index]!
    let closing = character === '[' ? glob.indexOf(']', index + 2) : -1
    if (glob.startsWith('**', index)) {
      let whole =
        (index === 0 || glob[index - 1] === '/') &&
        (index + 2 === glob.length || glob[index + 2] === '/')
      if (whole && glob[index + 2] === '/') {
        source += '(?:[^/]+/)*'
        index += 2
      } else {
        source += whole ? '.*' : '[^/]*'
        index += 1
      }
    } else if (character === '*') {
      source += '[^/]*'
    } else if (character === '?') {
      source += '[^/]'
    } else if (character === '{' && glob.includes('}', index)) {
      braces += 1
      source += '(?:'
    } else if (character === ',' && braces > 0) {
      source += '|'
    } else if (character === '}' && braces > 0) {
      braces -= 1
      source += ')'
    } else if (closing === -1) {
      source += character.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)
    } else {
      let body = glob.slice(index + 1, closing).replace(/^!/u, '^')
      source += `[${body.replaceAll('\\', '\\\\')}]`
      index = closing
    }
  }
  return new RegExp(`^${source}$`, 'u')
}
