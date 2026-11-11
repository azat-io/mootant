import type { ErrorRealm } from '../types/error-realm'

import { getErrorMessage } from '../../shared/get-error-message'

/**
 * Message of a thrown value that throws when it is read.
 */
const UNREADABLE_MESSAGE = 'An error mootant cannot read.'

/**
 * Reads the message and the realm of a thrown value. A project can throw
 * anything, such as a `Proxy` with throwing traps, and a failed test must not
 * lose its flag to an odd value, so nothing here throws: a value that cannot be
 * read has the realm found before the read that threw, `other` when none was.
 *
 * @param entry - What circus keeps: a value, or a `[error, asyncError]` pair,
 *   of which the first counts.
 * @param realms - What tells the realms apart.
 * @param realms.current - `Error` of the vm of the running unit, or null.
 * @param realms.dead - `Error` of the vm of every unit that ended.
 * @returns First line of the message, at most 200 code units, and the realm.
 */
export function readErrorFacts(
  entry: unknown,
  realms: { current: ErrorConstructor | null; dead: WeakSet<object> },
): { realm: ErrorRealm; message: string } {
  let message = UNREADABLE_MESSAGE
  let realm: ErrorRealm = 'other'
  try {
    let value: unknown = Array.isArray(entry) ? entry[0] : entry
    realm = readRealm(value, realms)
    message = getErrorMessage(value)
  } catch {}
  return { message, realm }
}

/**
 * Tells where a thrown value comes from.
 *
 * @param value - What was thrown.
 * @param realms - What tells the realms apart.
 * @param realms.current - `Error` of the vm of the running unit, or null.
 * @param realms.dead - `Error` of the vm of every unit that ended.
 * @returns Where the value comes from.
 */
function readRealm(
  value: unknown,
  realms: { current: ErrorConstructor | null; dead: WeakSet<object> },
): ErrorRealm {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return 'primitive'
  }
  if (value instanceof Error) {
    return 'host'
  }
  if (realms.current !== null && value instanceof realms.current) {
    return 'current'
  }
  let prototype = Object.getPrototypeOf(value) as object | null
  while (prototype !== null) {
    let owner = Object.getOwnPropertyDescriptor(prototype, 'constructor')
    if (realms.dead.has(owner?.value as object)) {
      return 'stale'
    }
    prototype = Object.getPrototypeOf(prototype) as object | null
  }
  return 'other'
}
