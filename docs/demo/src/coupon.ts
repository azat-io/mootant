export interface Coupon {
  percent: number
  code: string
}

let pattern = /^([A-Z]+)-(\d{1,2})$/u

export function parseCoupon(input: string): Coupon | null {
  let match = pattern.exec(input.trim().toUpperCase())
  if (!match) {
    return null
  }
  let percent = Number(match[2])
  if (percent === 0 || percent > 50) {
    return null
  }
  return { code: match[1]!, percent }
}

export function applyCoupon(total: number, coupon: Coupon | null): number {
  if (!coupon) {
    return total
  }
  return Math.round(total * (100 - coupon.percent)) / 100
}
