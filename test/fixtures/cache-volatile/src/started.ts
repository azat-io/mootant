export function isTime(text: string): boolean {
  return text.endsWith('Z') && text.length === 24
}
