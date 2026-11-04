let log = []
async function* inner(n) {
  try {
    yield n + 1
    yield n * 2
  } finally {
    log.push('inner-finally' + n)
  }
}
async function* outer(n) {
  let got = yield* inner(n - 1)
  yield got ?? 'none'
  return n > 2 ? 'big' : 'small'
}
async function race(values) {
  let settled = await Promise.allSettled(values.map(async v => {
    if (v < 0) throw new Error('neg' + v)
    return v * 2
  }))
  return settled.map(s => s.status === 'fulfilled' ? s.value : s.reason.message)
}
export async function probe() {
  let out = []
  for await (let v of outer(3)) out.push(v)
  let it = outer(1)
  let first = await it.next()
  let early = await it.return('stop')
  return { out, first: [first.value, first.done], early: [early.value, early.done], race: await race([1, -2, 3]), log }
}
