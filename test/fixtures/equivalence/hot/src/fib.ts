let memo = new Map<number, number>()

export function fib(index: number): number {
  if (index < 2) {
    return index
  }
  if (memo.has(index)) {
    return memo.get(index)!
  }
  let value = fib(index - 1) + fib(index - 2)
  memo.set(index, value)
  return value
}
