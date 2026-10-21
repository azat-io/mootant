// Lower bounds from same-file data flow (catalog 3.4): each comparison loses
// the entry that its bound rules out.

export function counter(items: string[]): boolean {
  let seen = 0
  for (let item of items) seen += item.length
  return seen === 0 // seen starts at 0 and only grows: no <=
}

export function guarded(text: string): boolean {
  let depth = 0
  for (let char of text) {
    if (char === '(') depth++
    else if (depth > 0) depth-- // a decrement right after its guard: no !=
  }
  return depth === 0 // no <=
}

export function counted(names: string[]): boolean {
  let counts = new Map<string, number>()
  for (let name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  for (let [, count] of counts) if (count > 1) return true // values are at least 1: no !=
  return counts.size === 0 // the size of a Map: no <=
}

export function unique(items: string[]): boolean {
  return new Set(items).size > 0 // the size of a Set: no !=
}
