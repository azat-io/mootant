const SYMBOLS: Partial<Record<string, string>> = {
  EUR: '€',
  GBP: '£',
  USD: '$',
}

export function formatPrice(amount: number, currency = 'USD'): string {
  let symbol = SYMBOLS[currency]
  if (symbol === undefined) {
    throw new RangeError(`Unknown currency ${currency}`)
  }
  let sign = amount < 0 ? '-' : ''
  return `${sign}${symbol}${Math.abs(amount).toFixed(2)}`
}
