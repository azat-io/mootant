export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function truncate(text, length) {
  if (text.length <= length) {
    return text
  }
  return `${text.slice(0, Math.max(0, length - 1))}…`
}

export function pad(value, width, fill = ' ') {
  let text = String(value)
  while (text.length < width) {
    text = fill + text
  }
  return text
}

export function countWords(text) {
  let words = text.split(/\s+/).filter(word => word.length > 0)
  return words.length
}

export function capitalize(word) {
  if (word.length === 0) {
    return word
  }
  return word[0].toUpperCase() + word.slice(1)
}

export function joinList(items, last = 'and') {
  if (items.length === 0) {
    return ''
  }
  if (items.length === 1) {
    return items[0]
  }
  return `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}`
}
