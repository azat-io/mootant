globalThis.__oracleRegistry ??= []

export function register(name) {
  if (!globalThis.__oracleRegistry.includes(name)) {
    globalThis.__oracleRegistry.push(name)
  }
  return globalThis.__oracleRegistry.length
}

export function limit() {
  return Number(process.env.ORACLE_LIMIT ?? '5')
}

if (!Array.prototype.oracleLast) {
  Object.defineProperty(Array.prototype, 'oracleLast', {
    value() {
      return this[this.length - 1]
    },
    configurable: true,
  })
}
