// Plain JavaScript: without annotations most hints are unknown.
export function add(a, b) {
  return a + b // unknown +: the right operand is dropped
}

export function canEdit(u) {
  return u.isOwner && u.isActive // returned operands that may be booleans: two drops and false
}

export function canView(user) {
  return user && user.age > 18 // value mode: the comparison's mutants subsume dropping it
}

export function visible(list) {
  if (list.filter(Boolean).length > 0) {
    log('found %d', list.length) // logging call: not mutated, not removed
    render(list)
  }
}

export function total(items) {
  let sum = 0
  for (const item of items) sum += item.price
  return sum // the initializer has a mutant: no return-value mutant
}

export function pick(flag) {
  return flag ? 1 : 0 // 0 -> 1 would equal the other branch
}

export function memo(cache) {
  cache.value ||= compute() // ||= becomes =, and the assignment never happens
}
