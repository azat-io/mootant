export function countFiles(names: string[]): number {
  return names.filter(name => name.endsWith('.txt')).length
}
