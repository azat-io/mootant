/**
 * Words the quiet highlighting of the report marks as keywords.
 */
const KEYWORDS = new Set([
  'implements',
  'instanceof',
  'satisfies',
  'namespace',
  'protected',
  'interface',
  'undefined',
  'continue',
  'debugger',
  'function',
  'abstract',
  'readonly',
  'private',
  'declare',
  'default',
  'extends',
  'finally',
  'export',
  'import',
  'public',
  'return',
  'static',
  'switch',
  'typeof',
  'delete',
  'async',
  'await',
  'break',
  'catch',
  'class',
  'const',
  'false',
  'keyof',
  'super',
  'throw',
  'while',
  'yield',
  'case',
  'else',
  'enum',
  'from',
  'null',
  'this',
  'true',
  'type',
  'void',
  'with',
  'for',
  'get',
  'let',
  'new',
  'set',
  'try',
  'var',
  'as',
  'do',
  'if',
  'in',
  'of',
])

/**
 * Keywords after which a value starts, so that a slash after them opens a
 * regular expression.
 */
const OPERATORS = new Set([
  'instanceof',
  'typeof',
  'return',
  'delete',
  'throw',
  'yield',
  'await',
  'case',
  'else',
  'void',
  'new',
  'in',
  'of',
  'do',
])

/**
 * Line terminators of JavaScript, which end a line comment and a regular
 * expression.
 */
const LINE_TERMINATORS = new Set(['\u{2028}', '\u{2029}', '\n', '\r'])

/**
 * Characters that open a string or a template literal.
 */
const QUOTES = new Set(["'", '"', '`'])

/**
 * Marks the tokens of a JavaScript or TypeScript text for quiet highlighting:
 * keywords, comments, strings with template literals, regular expressions and
 * numbers. It reads the text without parsing it: a slash opens a regular
 * expression when the token before it cannot end a value and the line closes
 * it.
 *
 * @param source - Text of a file.
 * @returns Kind of each code unit: 0 plain, 1 keyword, 2 comment, 3 string or
 *   regular expression, 4 number.
 */
export function tokenizeSource(source: string): Uint8Array {
  let kinds = new Uint8Array(source.length)
  let afterValue = false
  let index = 0
  while (index < source.length) {
    let char = source[index]!
    let next = source[index + 1]
    let end = index + 1
    if (char === '/' && next === '/') {
      end = findLineEnd(source, index + 2)
      kinds.fill(2, index, end)
    } else if (char === '/' && next === '*') {
      end = findCommentEnd(source, index)
      kinds.fill(2, index, end)
    } else if (char === '/' && !afterValue) {
      end = findRegexEnd(source, index)
      afterValue = end > index + 1
      if (afterValue) {
        kinds.fill(3, index, end)
      }
    } else if (QUOTES.has(char)) {
      end = findStringEnd(source, index)
      kinds.fill(3, index, end)
      afterValue = true
    } else if (/[\w$]/u.test(char)) {
      end = findWordEnd(source, index)
      let word = source.slice(index, end)
      if (/\d/u.test(char)) {
        kinds.fill(4, index, end)
      } else if (KEYWORDS.has(word) && source[index - 1] !== '.') {
        kinds.fill(1, index, end)
      }
      afterValue = !OPERATORS.has(word) || source[index - 1] === '.'
    } else if (!/\s/u.test(char)) {
      afterValue = ')]}'.includes(char)
    }
    index = end
  }
  return kinds
}

/**
 * Finds the end of a regular expression literal: its closing slash outside a
 * character class, then its flags.
 *
 * @param source - Text of a file.
 * @param start - Offset of the opening slash.
 * @returns Offset just past the flags, or just past the opening slash when the
 *   line ends before the closing one.
 */
function findRegexEnd(source: string, start: number): number {
  let inClass = false
  let end = start + 1
  while (end < source.length && !LINE_TERMINATORS.has(source[end]!)) {
    let char = source[end]
    if (char === '/' && !inClass) {
      end += 1
      while (end < source.length && /\w/u.test(source[end]!)) {
        end += 1
      }
      return end
    }
    if (char === '[' || char === ']') {
      inClass = char === '['
    }
    end += char === '\\' ? 2 : 1
  }
  return start + 1
}

/**
 * Finds the end of a string or a template literal: its closing quote, past
 * escaped characters. A string left open ends at the line break, a template
 * literal at the end of the text.
 *
 * @param source - Text of a file.
 * @param start - Offset of the opening quote.
 * @returns Offset just past the closing quote, or of the line break or the
 *   length of the text when the quote is not closed.
 */
function findStringEnd(source: string, start: number): number {
  let quote = source[start]!
  let end = start + 1
  while (end < source.length) {
    let current = source[end]
    if (
      current === quote ||
      (quote !== '`' && (current === '\n' || current === '\r'))
    ) {
      break
    }
    end += current === '\\' ? 2 : 1
  }
  return Math.min(source[end] === quote ? end + 1 : end, source.length)
}

/**
 * Finds the end of a word or a number: a number takes its dots, such as `1.5`,
 * and a word ends before one, such as `task` of `task.return`.
 *
 * @param source - Text of a file.
 * @param start - Offset of its first character.
 * @returns Offset just past the word or number.
 */
function findWordEnd(source: string, start: number): number {
  let number = /\d/u.test(source[start]!)
  let end = start + 1
  while (end < source.length && /[\w$.]/u.test(source[end]!)) {
    if (!number && source[end] === '.') {
      break
    }
    end += 1
  }
  return end
}

/**
 * Finds the end of a line: the next line terminator or the end of the text.
 *
 * @param source - Text of a file.
 * @param start - Offset to look from.
 * @returns Offset of the line terminator, or the length of the text.
 */
function findLineEnd(source: string, start: number): number {
  let end = start
  while (end < source.length && !LINE_TERMINATORS.has(source[end]!)) {
    end += 1
  }
  return end
}

/**
 * Finds the end of a block comment.
 *
 * @param source - Text of a file.
 * @param start - Offset of the slash that opens it.
 * @returns Offset just past the star and slash that close it, or the length of
 *   the text when it is not closed.
 */
function findCommentEnd(source: string, start: number): number {
  let found = source.indexOf('*/', start + 2)
  return found === -1 ? source.length : found + 2
}
