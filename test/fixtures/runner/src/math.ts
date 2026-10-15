export function add(left: number, right: number): number {
  return left + right
}

export function isPositive(value: number): boolean {
  return value > 0
}

export function countDown(start: number): number {
  let steps = 0
  for (let value = start; value > 0; value--) {
    steps++
  }
  return steps
}
