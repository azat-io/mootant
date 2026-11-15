export function emitLater(listener?: () => void): boolean {
  setTimeout(() => {
    if (listener) {
      listener()
    }
  }, 0)
  return true
}

export function settle(value: number | null): number | null {
  let failed = Promise.reject(new Error('settled late'))
  if (value !== null) {
    failed.catch(() => {})
  }
  return value
}
