/**
 * Splits `NODE_OPTIONS` into words as Node does: a space outside double quotes
 * ends a word, a double quote opens or closes a quoted part and is dropped, and
 * inside quotes a backslash keeps the character after it. Tabs and line breaks
 * belong to words, as in Node.
 *
 * @param nodeOptions - Value of `NODE_OPTIONS`.
 * @returns Words in order, such as `--require` and `./my setup.cjs` for
 *   `--require "./my setup.cjs"`.
 */
export function readNodeOptions(nodeOptions: string): string[] {
  let words: string[] = []
  let word: string | null = null
  let quoted = false
  let escaped = false
  for (let char of nodeOptions) {
    if (escaped) {
      word = `${word ?? ''}${char}`
      escaped = false
    } else if (quoted && char === '\\') {
      escaped = true
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ' ' && !quoted) {
      if (word !== null) {
        words.push(word)
      }
      word = null
    } else {
      word = `${word ?? ''}${char}`
    }
  }
  if (word !== null) {
    words.push(word)
  }
  return words
}
