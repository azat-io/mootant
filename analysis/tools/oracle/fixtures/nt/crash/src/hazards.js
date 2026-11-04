export function maybeExit(code) {
  if (code > 100) {
    process.exit(0)
  }
  return code
}

export function maybeFail(code) {
  if (code > 100) {
    process.exitCode = 1
  }
  return code
}

export function sumTo(count) {
  let total = 0
  for (let index = 0; index < count; index++) {
    total += index
  }
  return total
}

export async function pollUntil(check, tries) {
  let left = tries
  while (left > 0) {
    if (await check()) {
      return true
    }
    left--
  }
  return false
}

export function depth(count) {
  return count <= 0 ? 0 : 1 + depth(count - 1)
}

export function notify(listener) {
  queueMicrotask(() => {
    if (listener) {
      listener()
    }
  })
}

export function rejectLater(value) {
  let promise = Promise.reject(new Error('later'))
  if (value) {
    promise.catch(() => {})
  }
  return value
}

export function makeRows(count, width) {
  let rows = []
  for (let row = 0; row < count; row++) {
    rows.push(new Array(width).fill(row))
  }
  return rows.length
}

export function chatter(lines, verbose) {
  if (verbose) {
    for (let line = 0; line < lines; line++) {
      console.log(`line ${line} ${'x'.repeat(200)}`)
    }
  }
  return lines
}

export function grow(count) {
  let blocks = []
  for (let block = 0; block < count; block++) {
    blocks.push(new Array(4 * 1024 * 1024).fill(block))
  }
  return blocks.length
}
