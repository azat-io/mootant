export function render(count) {
  let doubled = count * 2
  let label = count > 1 ? 'many' : 'one'
  return `${label}:${doubled}`
}
