import type { Coupon } from './coupon'

import { getDiscount } from './discount'
import { getShipping } from './shipping'
import { applyCoupon } from './coupon'
import { getTax } from './tax'

export interface Customer {
  coupon: Coupon | null
  isMember: boolean
  country: string
}

export interface Item {
  quantity: number
  weight: number
  price: number
  name: string
}

export function getSubtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function getWeight(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.weight * item.quantity, 0)
}

export function getTotal(items: Item[], customer: Customer): number {
  if (items.length === 0) {
    return 0
  }
  let subtotal = getSubtotal(items)
  let discounted = applyCoupon(
    subtotal - getDiscount(subtotal, customer.isMember),
    customer.coupon,
  )
  let shipping = getShipping(getWeight(items), customer.country)
  return discounted + getTax(discounted, customer.country) + shipping
}
