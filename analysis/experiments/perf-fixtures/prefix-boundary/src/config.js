let cached = null

// Lazy singleton: the first call builds the configuration, later calls reuse
// it without evaluating the code that built it.
export function getConfig() {
  if (cached === null) {
    cached = createConfig()
  }
  return cached
}

function createConfig() {
  return { retries: 3, mode: 'strict', timeout: 2000 }
}
