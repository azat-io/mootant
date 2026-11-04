let seen = new Set()

export function clear() {
  seen.clear()
}

export function track(id) {
  if (seen.has(id)) {
    return false
  }
  seen.add(id)
  return true
}
