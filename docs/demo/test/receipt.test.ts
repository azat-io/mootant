import { describe, expect, it } from 'vitest'

import { formatReceipt } from '../src/receipt'

describe('formatReceipt', () => {
  it('ends with the total', () => {
    let book = { name: 'Book', quantity: 2, weight: 1, price: 20 }
    expect(formatReceipt([book], 40)).toContain('Total: $40.00')
  })
})
