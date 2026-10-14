/**
 * Multiplier of the generator, from the sample `rand` of the C standard.
 */
const MULTIPLIER = 1_103_515_245

/**
 * Increment of the generator.
 */
const INCREMENT = 12_345

/**
 * Mask that keeps the state in 31 bits.
 */
const MASK = 0x7f_ff_ff_ff

/**
 * Creates a seeded generator of random integers, so a property test sees the
 * same cases on every run.
 *
 * @param seed - Initial state of the generator.
 * @returns Function that returns an integer from 0 up to, but not including,
 *   its limit.
 */
export function createRandom(seed: number): (limit: number) => number {
  let state = seed & MASK
  return limit => {
    state = (Math.imul(state, MULTIPLIER) + INCREMENT) & MASK
    return Math.floor((state / (MASK + 1)) * limit)
  }
}
