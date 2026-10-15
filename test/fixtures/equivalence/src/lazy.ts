let table: Map<string, number> | undefined

export function lookup(key: string): number {
  table ??= new Map([
    ['one', 1],
    ['two', 2],
  ])
  return table.get(key) ?? 0
}
