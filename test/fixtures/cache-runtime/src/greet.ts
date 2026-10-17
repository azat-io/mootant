export function greet(name: string): string {
  if (process.env.MOOTANT_LOUD === '1') {
    return `${name.toUpperCase()}!`
  }
  return `hello ${name}`
}
