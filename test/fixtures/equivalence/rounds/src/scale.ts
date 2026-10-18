export const UNIT = 'px'

export function scale(value: number): number {
  if (value < 0) {
    return 0
  }
  return value * 2
}
