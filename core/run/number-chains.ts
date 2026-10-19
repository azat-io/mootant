/**
 * Numbers the serial chains of a plan: units with the same key, such as one
 * test file, get the same number, from 0 in the order keys first appear.
 *
 * @param keys - Key of each unit in plan order.
 * @returns Number of each unit's chain in plan order.
 */
export function numberChains(keys: readonly string[]): number[] {
  let numbers = new Map<string, number>()
  return keys.map(key => {
    let found = numbers.get(key) ?? numbers.size
    numbers.set(key, found)
    return found
  })
}
