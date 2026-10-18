/**
 * Splits a shell command line into its simple commands and their words, as a
 * POSIX shell would before running them: commands end at `&&`, `||`, `;`, `|`,
 * `&` and line breaks; words end at unquoted whitespace; single quotes keep
 * their text as it is; a backslash escapes the next character, inside double
 * quotes only a double quote, a dollar sign, a backtick or a backslash; quotes
 * are removed. Nothing is expanded, so `$VAR` and globs stay as written, as
 * Node expands test globs itself; parentheses and redirects are plain text.
 *
 * @param text - Command line, such as a `package.json` script.
 * @returns Words of each simple command that has any, in order.
 */
export function parseCommand(text: string): string[][] {
  let commands: string[][] = []
  let words: string[] = []
  let word: string | null = null
  let quote: null | '"' | "'" = null
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
        word += character
      }
    } else if (quote === '"') {
      if (character === '"') {
        quote = null
      } else if (character === '\\' && '"$\\`'.includes(text[index + 1]!)) {
        index += 1
        word += text[index]!
      } else {
        word += character
      }
    } else if (character === '\\' && index + 1 < text.length) {
      index += 1
      if (text[index] !== '\n') {
        word = (word ?? '') + text[index]!
      }
    } else if (character === '"' || character === "'") {
      quote = character
      word ??= ''
    } else if ('&|;\n'.includes(character)) {
      endCommand()
    } else if (/\s/u.test(character)) {
      endWord()
    } else {
      word = (word ?? '') + character
    }
  }
  endCommand()
  return commands
}
