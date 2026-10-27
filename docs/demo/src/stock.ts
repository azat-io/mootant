export interface Stock {
  reserved: number
  total: number
}

export function getAvailable(stock: Stock): number {
  return Math.max(stock.total - stock.reserved, 0)
}

export function reserve(stock: Stock, quantity: number): Stock {
  if (quantity <= 0 || quantity > getAvailable(stock)) {
    throw new RangeError(`Cannot reserve ${quantity} items`)
  }
  return { ...stock, reserved: stock.reserved + quantity }
}
