export function renderAll(items) {
  for (let i = 0; i < items.length; i++) {
    items[i].render()
  }
}

export function notifyAll(listeners, event) {
  let index = 0
  while (index < listeners.length) {
    listeners[index].notify(event)
    index++
  }
}

export function drain(queue, handle) {
  while (queue.length > 0) {
    handle(queue.shift())
  }
}

export function findRoot(node) {
  let current = node
  for (;;) {
    if (current.parent === null) {
      return current
    }
    if (current.isRoot) {
      return current
    }
    current = current.parent
  }
}
