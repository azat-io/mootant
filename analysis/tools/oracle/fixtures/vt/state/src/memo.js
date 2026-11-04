const memo = new Map()

export function fib(n) {
  if (n < 2) {
    return n
  }
  if (memo.has(n)) {
    return memo.get(n)
  }
  let value = fib(n - 1) + fib(n - 2)
  memo.set(n, value)
  return value
}
