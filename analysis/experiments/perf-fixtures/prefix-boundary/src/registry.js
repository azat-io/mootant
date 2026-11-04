let entries = new Map()

export function register(name, value) {
  entries.set(name, value)
}

export function lookup(name) {
  let key = String(name).trim()
  if (!entries.has(key)) {
    return null
  }
  return entries.get(key)
}

export function size() {
  return entries.size
}
