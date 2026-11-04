let names = new Set()

function normalize(name) {
  return name.trim().toLowerCase()
}

export function register(name) {
  names.add(normalize(name))
}

export function isRegistered(name) {
  return names.has(normalize(name))
}
