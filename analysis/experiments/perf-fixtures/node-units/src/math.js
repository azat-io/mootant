export function clamp(value, min, max) {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

export function average(values) {
  if (values.length === 0) {
    return 0
  }
  let total = 0
  for (let value of values) {
    total += value
  }
  return total / values.length
}

export function isEven(value) {
  return value % 2 === 0
}

export function unusedHelper(value) {
  return value * 3
}
