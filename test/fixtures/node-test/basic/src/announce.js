export function announce(listener, event) {
  Promise.resolve().then(() => listener(`${event} done`))
  return true
}
