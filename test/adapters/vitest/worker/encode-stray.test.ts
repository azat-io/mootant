import { describe, expect, it } from 'vitest'
import { deserialize } from 'node:v8'

import { encodeStray } from '../../../../adapters/vitest/worker/encode-stray'

/**
 * Decodes the error of an encoded unhandled error.
 *
 * @param error - Base64 of the `node:v8` serialization.
 * @returns Decoded value.
 */
function decode(error: string): unknown {
  return deserialize(Buffer.from(error, 'base64'))
}

describe('encodeStray', () => {
  it('keeps big integers, cycles and undefined values, which JSON cannot write', () => {
    let error: Record<string, unknown> = {
      message: 'boom',
      test: undefined,
      big: 10n,
    }
    error['self'] = error
    let stray = encodeStray(error, 'Unhandled Rejection', 3)
    let decoded = decode(stray.error) as Record<string, unknown>

    expect(JSON.parse(JSON.stringify(stray))).toStrictEqual(stray)
    expect(stray).toMatchObject({ type: 'Unhandled Rejection', id: 3 })
    expect(decoded).toMatchObject({ message: 'boom', big: 10n })
    expect(Object.hasOwn(decoded, 'test')).toBe(true)
    expect(decoded['self']).toBe(decoded)
  })

  it('keeps only the first line of a value that cannot be serialized', () => {
    let error = { message: 'boom\n    at f', tag: Symbol('tag') }
    let stray = encodeStray(error, 'Uncaught Exception', 0)

    expect(decode(stray.error)).toBe('boom')
  })
})
