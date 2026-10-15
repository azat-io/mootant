/**
 * Bounds of one try or of one unit.
 */
export interface TryLimits {
  /**
   * Site evaluations allowed; the next evaluation throws.
   */
  hitLimit: number

  /**
   * Milliseconds allowed.
   */
  timeout: number
}
