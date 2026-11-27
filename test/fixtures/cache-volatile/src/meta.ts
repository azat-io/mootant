export function isTime(text: string): boolean {
  return text.startsWith('20') && text.endsWith('Z')
}
