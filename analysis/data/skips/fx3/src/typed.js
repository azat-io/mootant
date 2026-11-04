export function count(list) {
  let items = list ?? []
  if (items) {
    return items.length
  }
  return -1
}

export function label(user) {
  let name = String(user.name)
  if (name) {
    return name
  }
  return 'anonymous'
}

export function len(text) {
  let parts = text.split(',')
  if (parts) {
    return parts.length
  }
  return 0
}
