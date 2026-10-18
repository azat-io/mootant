export function add(left, right) {
  return left + right
}

export function isPositive(value) {
  return value > 0
}

export function sign(value) {
  if (value >= 0) {
    return 1
  }
  return -1
}
