export function findRoot(node) {
  let current = node
  for (;;) {
    if (current.isRoot) {
      break
    }
    if (current.parent === null) {
      break
    }
    current = current.parent
  }
  return current
}
