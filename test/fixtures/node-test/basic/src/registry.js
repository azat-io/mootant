let entries = []

export function register(name) {
  entries.push(name)
  return entries.length
}

export function size() {
  return entries.length
}
