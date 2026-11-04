export async function retryWithBackoff(task, attempts = 3, base = 10) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task(attempt)
    } catch {}
    let delay = Math.min(base * 2 ** attempt, 1000)
    await new Promise(resolve => {
      setTimeout(resolve, delay)
    })
  }
  throw new Error('gave up')
}

export async function drain(items) {
  let left = items.length
  while (left > 0) {
    await new Promise(resolve => {
      setTimeout(resolve, 1)
    })
    left--
  }
  return items.length
}
