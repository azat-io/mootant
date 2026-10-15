export function render(n: number): string {
  let doubled = n * 2
  let label = n > 1 ? 'many' : 'one'
  return `${label}:${doubled}`
}
