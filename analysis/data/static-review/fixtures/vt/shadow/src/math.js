export function add(a, b) {
  return a + b
}

// Code that names a local binding globalThis, as old helpers that pick the
// global object of an environment do.
export function sum(globalThis, values) {
  let total = 0
  for (let value of values) {
    total = total + value * globalThis.scale
  }
  return total
}
