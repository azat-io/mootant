function* gen(n) {
  let got = yield n + 1
  yield* [got, n - 1]
  try { yield n * 2 } finally { log.push('fin' + n) }
  return got ?? n * 3
}
let log = []
async function asy(p, n) {
  let v = await p
  for await (let x of [p, Promise.resolve(n + 1)]) n += x
  let w = await (n > 3 ? Promise.resolve(n - 1) : n + 1)
  return [v + n, w]
}
async function* agen(n) {
  yield n + 1
  yield await Promise.resolve(n * 2)
}
export async function probe() {
  let it = gen(2)
  let seq = [it.next(), it.next(10), it.next(), it.return(5)].map(r => [r.value, r.done])
  let out = []
  for await (let v of agen(3)) out.push(v)
  return { seq, asy: await asy(Promise.resolve(1), 2), out, log }
}
