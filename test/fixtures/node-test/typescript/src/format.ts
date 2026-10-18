interface Price {
  currency: string
  amount: number
}

export function formatPrice(price: Price): string {
  let whole = price.amount >= 100 ? Math.round(price.amount) : price.amount
  return `${whole} ${price.currency}`
}
