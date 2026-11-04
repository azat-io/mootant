let count = 0

export function reset() {
  count = 0
}

export function increment(step = 1) {
  count += step
  return count
}
