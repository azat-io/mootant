export function debounce(callback, wait) {
  let timer = null
  return () => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(callback, wait)
  }
}
