/**
 * Runs a task for each item, one chunk at a time: the tasks of a chunk run
 * together, and the next chunk starts once they are all done.
 *
 * @param items - Items in order.
 * @param size - Most tasks that run at once.
 * @param task - Task for one item.
 * @returns Resolves when every task is done.
 */
export async function runInChunks<Item>(
  items: readonly Item[],
  size: number,
  task: (item: Item) => Promise<void>,
): Promise<void> {
  let chunks = Array.from(
    { length: Math.ceil(items.length / size) },
    (_value, index) => items.slice(index * size, (index + 1) * size),
  )
  await chunks.reduce(async (previous, chunk) => {
    await previous
    await Promise.all(chunk.map(item => task(item)))
  }, Promise.resolve())
}
