export function remove(map, key, onRemove) {
  if (map.delete(key)) {
    onRemove(key)
  }
}
