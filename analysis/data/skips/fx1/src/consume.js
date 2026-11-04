export function consume(queue, ready, onItem) {
  if (queue.shift() && ready) {
    onItem()
  }
}
