let log: string[] = []
function resource(name: string) {
  return { name, [Symbol.dispose]() { log.push('dispose ' + name) } }
}
function work(n: number) {
  using a = resource('a' + n)
  using b = n > 1 ? resource('b') : null
  log.push('work ' + (n * 2))
  return a.name.length + (b ? 1 : 0)
}
export function probe() {
  let r = [work(1), work(2)]
  return { r, log }
}
