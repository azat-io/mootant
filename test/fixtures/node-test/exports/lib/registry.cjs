let names = new Set()

exports.register = function register(name) {
  if (names.has(name)) {
    throw new Error(`${name} is already registered`)
  }
  names.add(name)
}
