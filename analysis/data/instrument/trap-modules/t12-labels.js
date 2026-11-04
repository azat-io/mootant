function lbl(rows) {
  let n = 0
  outer: for (let r of rows) {
    inner: for (let x of r) {
      if (x < 0) continue outer
      if (x > 9) break outer
      if (x === 5) continue inner
      n += x
    }
  }
  block: {
    if (n > 3) break block
    n *= 2
  }
  return n
}
function sw(k) {
  let out = []
  switch (k) {
    case 1:
      out.push('a')
    case 2: {
      out.push('b')
      break
    }
    case 3:
      let local = k * 2
      out.push(local)
      break
    default:
      out.push('z')
  }
  return out
}
export function probe() {
  return { l: [lbl([[1, 2], [3, -1, 4], [5, 6]]), lbl([[1, 20, 2]]), lbl([[1]])], s: [sw(1), sw(2), sw(3), sw(4)] }
}
