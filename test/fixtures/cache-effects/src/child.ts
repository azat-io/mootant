export function shout(text: string): string {
  return text === '' ? 'none' : text.toUpperCase()
}
