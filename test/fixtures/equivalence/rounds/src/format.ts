import { scale, UNIT } from './scale'

export function format(value: number): string {
  return `${scale(value)}${UNIT}`
}
