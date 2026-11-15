import { setTimeout as sleep } from 'node:timers/promises'

export async function settle(value: number, quick: boolean): Promise<number> {
  let delay = 1000
  if (quick) {
    delay = 5
  }
  await sleep(delay)
  return value
}

export function double(value: number): number {
  return value * 2
}
