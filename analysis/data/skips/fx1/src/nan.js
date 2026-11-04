export function toPage(text) {
  return Number.parseInt(text, 10) || 1
}

export function toCount(text) {
  let count = Number(text) || 0
  return count
}

export function ratio(done, total) {
  return done / total || 0
}
