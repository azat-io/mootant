export function getDiscount(total: number, isMember: boolean): number {
  if (total >= 100 || isMember) {
    return total * 0.1
  }
  return 0
}
