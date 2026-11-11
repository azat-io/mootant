let loaded = await Promise.resolve({ retries: 3, delay: 100 })

export function retries() {
  return loaded.retries > 2 ? loaded.retries : 0
}

export function backoff(attempt) {
  return loaded.delay * 2 ** attempt
}
