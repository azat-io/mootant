export function processAll(items, onItem) {
  let count = 0
  for (let item of items) {
    count++
    onItem(item, count)
  }
  return count
}
