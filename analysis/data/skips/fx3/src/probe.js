export function size(flag) {
  let items = []
  if (flag) {
    items = null
  }
  if (items) {
    return items.length
  }
  return -1
}

export function pick(options) {
  let label = options.label ?? 'Untitled'
  let count = options.count || 0
  let name = options.name || 'anonymous'
  return { label, count, name }
}

export async function load(cache, key) {
  let value = await cache.get(key)
  let text = await String(value)
  return text.trim()
}

export function first(list) {
  if (list.length >= 0) {
    return list[0]
  }
  return null
}

export function slugify(title) {
  return title.trim().toLowerCase().replaceAll(' ', '-')
}

export function total(prices) {
  let sum = 0
  for (let price of prices) {
    sum += price
  }
  return sum
}

export function cmp(a, b) {
  return a.order - b.order
}
