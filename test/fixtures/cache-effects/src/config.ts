export function label(value: string): string {
  return value === '' ? 'empty' : `[${value}]`
}
