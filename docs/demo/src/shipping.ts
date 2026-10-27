const HEAVY = 5

const PARCEL_LIMIT = 20

export function getShipping(weight: number, country: string): number {
  let rate = country === 'US' ? 5 : 25
  return weight > HEAVY ? rate * 3 : rate
}

export function countParcels(weight: number): number {
  let left = weight
  let parcels = 0
  while (left > 0) {
    left -= Math.min(left, PARCEL_LIMIT)
    parcels += 1
  }
  return parcels
}
