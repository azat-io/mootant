const RATES: Partial<Record<string, number>> = {
  DE: 0.19,
  FR: 0.2,
  US: 0,
}

export function getTax(amount: number, country: string): number {
  let rate = RATES[country]
  if (rate === undefined) {
    throw new RangeError(`No tax rate for ${country}`)
  }
  return Math.round(amount * rate * 100) / 100
}
