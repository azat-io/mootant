import { createHash } from 'node:crypto'

/**
 * Hashes a value of plain JSON, such as a list of the parts of a key.
 *
 * @param value - Value to hash; `JSON.stringify` decides its text.
 * @returns SHA-256 of its JSON text, in hex.
 */
export function createDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
