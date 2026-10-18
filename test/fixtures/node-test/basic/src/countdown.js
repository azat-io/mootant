export function countdown(from, step) {
  let steps = 0
  let left = from
  while (left > 0) {
    left -= step
    steps += 1
  }
  return steps
}
