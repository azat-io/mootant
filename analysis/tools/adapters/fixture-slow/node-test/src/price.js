export function applyDiscount(price, percent) {
  if (percent > 100) {
    throw new RangeError('percent must be at most 100')
  }
  return price - (price * percent) / 100
}

export function isFree(price) {
  return price <= 0
}
