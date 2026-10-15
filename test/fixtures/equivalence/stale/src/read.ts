let value = 0

export function read(): number {
  value = 0
  let result = value
  value = 1
  return result
}
