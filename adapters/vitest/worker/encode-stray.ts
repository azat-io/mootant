import { serialize } from 'node:v8'

import type { VitestStray } from '../types/vitest-worker'

import { getErrorMessage } from '../../shared/get-error-message'

/**
 * Encodes an unhandled error for an out file the way Vitest's forks pool sends
 * it to the main process: serialized by `node:v8`, which keeps the big
 * integers, cycles and undefined values that JSON drops or cannot write, as
 * base64. A value `node:v8` cannot serialize keeps only its first line
 * (`getErrorMessage`), so recording an error never throws in Vitest's
 * listener.
 *
 * @param error - Error as Vitest serialized it, or a reason that is not an
 *   object.
 * @param type - Event of the error, as Vitest names it.
 * @param id - Number of the error among those the worker recorded.
 * @returns Unhandled error as the out file keeps it.
 */
export function encodeStray(
  error: unknown,
  type: string,
  id: number,
): VitestStray {
  let data: Buffer
  try {
    data = serialize(error)
  } catch {
    data = serialize(getErrorMessage(error))
  }
  return { error: data.toString('base64'), type, id }
}
