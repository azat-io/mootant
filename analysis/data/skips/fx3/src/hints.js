export function norm(x = '') {
  if (typeof x === 'string') {
    return x.trim()
  }
  return String(x)
}

export function pick(value = 0) {
  return value || 10
}

export function keys(object = {}) {
  let names = Object.keys(object)
  return names.length > 0 ? names : null
}

let count = 0
export function next() {
  count += 1
  return count > 0 ? count : -1
}
