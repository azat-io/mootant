export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

export function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

export async function withRetry(task, attempts = 3) {
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task(attempt)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export function plural(count, word) {
  return count === 1 ? word : `${word}s`
}

export function range(count) {
  let values = []
  for (let index = 0; index < count; index++) {
    values.push(index)
  }
  return values
}
