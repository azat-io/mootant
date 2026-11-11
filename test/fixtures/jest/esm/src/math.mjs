export function sign(value) {
  return value >= 0 ? 1 : -1
}

export function average(values) {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b) / values.length
}
