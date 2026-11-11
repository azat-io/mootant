/**
 * Heap limit of the new workers of a session.
 */
export interface HeapCap {
  /**
   * Raises `current` past the cap of a worker that ran out of memory, up to the
   * top, so several workers dying at one cap raise it once.
   *
   * @param from - Cap of that worker.
   */
  raise(from: number): void

  /**
   * Megabytes a new worker gets, or null for good when the project gives its
   * own limit.
   */
  current: number | null
}
