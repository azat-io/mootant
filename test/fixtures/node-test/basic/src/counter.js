let count = 0

export function increment() {
  count += 1
  return count
}

export function current() {
  return count
}
