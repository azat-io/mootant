/**
 * Splits a shell command line into its simple commands and their words, as a
 * POSIX shell would before running them: commands end at `&&`, `||`, `;`, `|`,
 * `&` and line breaks; words end at unquoted whitespace; single quotes keep
 * their text as it is; a backslash escapes the next character, inside double
 * quotes only a double quote, a dollar sign, a backtick or a backslash; quotes
 * are removed. Nothing is expanded, so `$VAR` and globs stay as written, for
 * the tool the command runs to read; parentheses and redirects are plain text.
 *
 * @param text - Command line, such as a `package.json` script.
 * @param mark - Text put before each `$` and backtick that the shell keeps as
 *   written, in single quotes, after a backslash or right before a quote, so
 *   that a caller that expands them can tell them apart; none by default.
 * @returns Words of each simple command that has any, in order.
 */
export function parseCommand(text: string, mark = ''): string[][] {
  let commands: string[][] = []
  let words: string[] = []
  let word: string | null = null
  let quote: null | '"' | "'" = null
  /**
   * Gives a character the shell keeps as written, marked when it would expand
   * otherwise.
   *
   * @param character - A character that quotes or a backslash keep.
   * @returns The character, with the mark before a `$` or a backtick.
   */
  function keep(character: string): string {
    return character === '$' || character === '`' ? mark + character : character
  }
  /**
   * Ends the current word, if any.
   */
  function endWord(): void {
    if (word !== null) {
      words.push(word)
      word = null
    }
  }
  /**
   * Ends the current command, if it has words.
   */
  function endCommand(): void {
    endWord()
    if (words.length > 0) {
      commands.push(words)
      words = []
    }
  }
  for (let index = 0; index < text.length; index++) {
    let character = text[index]!
    if (quote === "'") {
      if (character === "'") {
        quote = null
      } else {
        word += keep(character)
      }
    } else if (quote === '"') {
      if (character === '"') {
        quote = null
      } else if (character === '\\' && '"$\\`'.includes(text[index + 1]!)) {
        index += 1
        word += keep(text[index]!)
      } else {
        word += text[index + 1] === '"' ? keep(character) : character
      }
    } else if (character === '\\' && index + 1 < text.length) {
      index += 1
      if (text[index] !== '\n') {
        word = (word ?? '') + keep(text[index]!)
      }
    } else if (character === '"' || character === "'") {
      quote = character
      word ??= ''
    } else if ('&|;\n'.includes(character)) {
      endCommand()
    } else if (/\s/u.test(character)) {
      endWord()
    } else {
      let quoted = text[index + 1] === '"' || text[index + 1] === "'"
      word = (word ?? '') + (quoted ? keep(character) : character)
    }
  }
  endCommand()
  return commands
}
