import { createHash } from 'node:crypto'

/**
 * Texts that identify a mutant within a run.
 */
interface MutantIdentity {
  /**
   * Replacement text with line breaks normalized to LF.
   */
  replacement: string

  /**
   * Number of earlier mutants of the file with the same scope, mutator,
   * original and replacement.
   */
  occurrence: number

  /**
   * Replaced text with line breaks normalized to LF.
   */
  original: string

  /**
   * Full id of the mutator.
   */
  mutator: string

  /**
   * Dotted names of the declarations around the mutant, empty at the top level.
   */
  scope: string

  /**
   * Display path of the file.
   */
  path: string
}

/**
 * Version tag hashed into every id; a change of the identity inputs needs a new
 * tag.
 */
const IDENTITY_TAG = 'mootant:mutant-id:v1'

/**
 * Digits and lowercase letters without i, l, o and u, in value order.
 */
// spell-checker: disable-next-line
const BASE32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * Builds the stable id of a mutant: the SHA-256 of the identity inputs encoded
 * as an array in JSON, of which the first 60 bits become 12 base32 characters.
 * The id contains no offsets, lines or columns, so edits elsewhere in the file
 * keep it.
 *
 * @param identity - Path, scope, mutator, texts and occurrence of the mutant.
 * @returns Id of 12 characters from the digits and the lowercase letters
 *   without i, l, o and u.
 */
export function createMutantId(identity: MutantIdentity): string {
  let { replacement, occurrence, original, mutator, scope, path } = identity
  let input = JSON.stringify([
    IDENTITY_TAG,
    path,
    scope,
    mutator,
    original,
    replacement,
    occurrence,
  ])
  return encodeBase32(createHash('sha256').update(input, 'utf8').digest(), 12)
}

/**
 * Encodes the leading bits of a digest in base32, most significant bit first, 5
 * bits per character.
 *
 * @param bytes - Digest with more bits than the characters need.
 * @param length - Number of characters to produce.
 * @returns The first characters of the encoding.
 */
function encodeBase32(bytes: Uint8Array, length: number): string {
  let characters = ''
  for (let index = 0; index < length; index++) {
    let bit = index * 5
    let byteIndex = Math.floor(bit / 8)
    let pair = bytes[byteIndex]! * 256 + bytes[byteIndex + 1]!
    let value = Math.floor(pair / 2 ** (11 - (bit % 8))) % 32
    characters += BASE32_ALPHABET[value]
  }
  return characters
}
