/**
 * Bytes of the one-letter escapes git writes in quoted paths.
 */
const ESCAPES: Record<string, number> = {
  '\\': 0x5c,
  '"': 0x22,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
}

/**
 * Reads a path git printed in double quotes, as it does for paths with control
 * characters, quotes or backslashes: C escapes and octal bytes, which together
 * form UTF-8.
 *
 * @param quoted - Path with its quotes, such as `"a\tb.ts"`.
 * @returns The path as git stored it, unescaped.
 */
export function unquoteGitPath(quoted: string): string {
  let text = quoted.slice(1, -1)
  let bytes: number[] = []
  let index = 0
  while (index < text.length) {
    let character = text[index]!
    if (character !== '\\') {
      let point = text.codePointAt(index)!
      let symbol = String.fromCodePoint(point)
      bytes.push(...Buffer.from(symbol, 'utf8'))
      index += symbol.length
      continue
    }
    let next = text[index + 1]!
    if (/[0-7]/u.test(next)) {
      bytes.push(Number.parseInt(text.slice(index + 1, index + 4), 8))
      index += 4
    } else {
      bytes.push(ESCAPES[next] ?? next.codePointAt(0)!)
      index += 2
    }
  }
  return Buffer.from(bytes).toString('utf8')
}
