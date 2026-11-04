export function readUntilEnd(tokens) {
  let out = []
  let index = 0
  while (tokens[index] !== 'EOF') {
    out.push(tokens[index])
    index++
  }
  return out
}

export function takeUntilStop(tokens) {
  let out = []
  for (let token of tokens) {
    if (token === 'stop') {
      break
    }
    out.push(token)
  }
  return out
}

export function describe(value) {
  if (typeof value === 'string') {
    return 'text'
  }
  return 'other'
}

export function isAdmin(user) {
  return user.role === 'admin' && user.active
}
