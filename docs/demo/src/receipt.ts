import type { Item } from './cart'

import { formatPrice } from './price'

export function formatReceipt(items: Item[], total: number): string {
  let lines = items.map(
    item =>
      `${item.name} × ${item.quantity}  ${formatPrice(item.price * item.quantity)}`,
  )
  // mootant-ignore-next-line string-literal: the footer is copy, not behavior
  lines.push('Thank you for shopping with us!')
  lines.push(`Total: ${formatPrice(total)}`)
  return lines.join('\n')
}
