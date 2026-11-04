const KEYWORDS = new Set(['if', 'else', 'for'])

export function isKeyword(word) {
  return KEYWORDS.has(word)
}
