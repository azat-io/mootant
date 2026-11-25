/**
 * Amounts that `getDiscount(total, false)` of the sample shop and its mutant
 * give for one total.
 */
export interface ProbeResult {
  /**
   * Amount of the original code, `total >= 100`.
   */
  original: string

  /**
   * Whether the amounts differ, so a test with this total catches the mutant.
   */
  killed: boolean

  /**
   * Amount of the mutant, `total > 100`.
   */
  mutant: string
}

/**
 * Compares `getDiscount` of the sample shop with its mutant for a customer who
 * is not a member, as the probe of the getting started guide shows them.
 *
 * @param total - Total of the order.
 * @returns Both amounts, rounded for display, and whether they differ.
 */
export function getProbeResult(total: number): ProbeResult {
  let original = total >= 100 ? total * 0.1 : 0
  let mutant = total > 100 ? total * 0.1 : 0
  return {
    original: formatAmount(original),
    mutant: formatAmount(mutant),
    killed: original !== mutant,
  }
}

/**
 * Rounds an amount for display. `101 * 0.1` is 10.100000000000001.
 *
 * @param amount - Amount to show.
 * @returns Amount with at most two decimals.
 */
function formatAmount(amount: number): string {
  return String(Number(amount.toFixed(2)))
}
