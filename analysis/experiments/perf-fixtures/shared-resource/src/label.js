export function label(count) {
  if (count === 0) {
    return 'none'
  }
  if (count === 1) {
    return 'one'
  }
  if (count < 5) {
    return 'few'
  }
  return 'many'
}
