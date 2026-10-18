export function check(value) {
  if (value > 10) {
    process.exitCode = 1
  }
  return value
}
