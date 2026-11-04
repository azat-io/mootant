export function emitLater(listener) {
  setTimeout(() => {
    if (listener) {
      listener()
    }
  }, 0)
  return true
}

export function settle(value) {
  let failed = Promise.reject(new Error('settled late'))
  if (value !== null) {
    failed.catch(() => {})
  }
  return value
}
