/**
 * The word `RegExp` other than right before a call.
 */
const STATICS_PATTERN = /\bRegExp\b(?!\s*\()/u

/**
 * Tells whether the text of a file may read what the last match took through
 * the legacy properties of the global `RegExp`, such as `RegExp.$1` or
 * `RegExp.lastMatch`, which keep the last match of any regular expression, so
 * that code sees it even when it reads only `test`. The check goes by the word:
 * every mention of `RegExp` counts unless it is called, so no line break,
 * comment, cast, alias or destructuring pattern hides a read, and a type or a
 * comment only keeps a mutant that could be skipped. It does not see a read in
 * another file or a spelling without the word, such as `/a/.constructor.$1`, so
 * a skip that rests on it is a guess.
 *
 * @param code - Text of the file.
 * @returns Whether the file may read what the last match took.
 */
export function readsRegexStatics(code: string): boolean {
  return STATICS_PATTERN.test(code)
}
