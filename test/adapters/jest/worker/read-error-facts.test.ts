import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'

import { readErrorFacts } from '../../../../adapters/jest/worker/read-error-facts'

/**
 * `Error` of the vm of the running unit.
 */
let CurrentError = runInNewContext('Error') as ErrorConstructor

/**
 * `Error` of the vm of a unit that ended.
 */
let DeadError = runInNewContext('Error') as ErrorConstructor

/**
 * Realms the tests tell apart.
 */
let realms = { dead: new WeakSet<object>([DeadError]), current: CurrentError }

/**
 * Message of what cannot be read.
 */
let unreadable = 'An error mootant cannot read.'

/**
 * Creates a proxy whose every trap throws.
 *
 * @returns A value no read of which succeeds.
 */
function createThrowingProxy(): object {
  let handler = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error('trap')
      },
    },
  )
  return new Proxy({}, handler)
}

describe('readErrorFacts', () => {
  it('reads an error of the outer realm as host', () => {
    expect(readErrorFacts(new TypeError('boom'), realms)).toStrictEqual({
      message: 'boom',
      realm: 'host',
    })
  })

  it('reads an error of the running unit as current', () => {
    expect(readErrorFacts(new CurrentError('boom'), realms)).toStrictEqual({
      realm: 'current',
      message: 'boom',
    })
  })

  it('reads an error of a dead realm as stale', () => {
    expect(readErrorFacts(new DeadError('boom'), realms)).toStrictEqual({
      message: 'boom',
      realm: 'stale',
    })
  })

  it('reads a subclass of the Error of a dead realm as stale', () => {
    /**
     * Error class of a project, on the `Error` of a dead realm.
     */
    class Late extends DeadError {}

    expect(readErrorFacts(new Late('boom'), realms)).toStrictEqual({
      message: 'boom',
      realm: 'stale',
    })
  })

  it('reads anything else as other', () => {
    let foreign = runInNewContext('new Error("foreign")') as Error

    expect(readErrorFacts(foreign, realms)).toStrictEqual({
      message: 'foreign',
      realm: 'other',
    })
    expect(readErrorFacts({ message: 'plain' }, realms)).toStrictEqual({
      message: 'plain',
      realm: 'other',
    })
  })

  it('tells a function apart from a primitive', () => {
    expect(readErrorFacts(() => {}, realms).realm).toBe('other')
  })

  it('reads a value with no current realm', () => {
    let current = { dead: new WeakSet<object>(), current: null }

    expect(readErrorFacts(new CurrentError('boom'), current)).toStrictEqual({
      message: 'boom',
      realm: 'other',
    })
  })

  it('reads a string, as a timeout of circus is, as primitive', () => {
    expect(
      readErrorFacts(
        'Exceeded timeout of 5000 ms for a test.\nAdd a timeout value',
        realms,
      ),
    ).toStrictEqual({
      message: 'Exceeded timeout of 5000 ms for a test.',
      realm: 'primitive',
    })
  })

  it('reads null and undefined as primitive', () => {
    expect(readErrorFacts(null, realms)).toStrictEqual({
      realm: 'primitive',
      message: 'null',
    })
    expect(readErrorFacts(undefined, realms)).toStrictEqual({
      message: 'undefined',
      realm: 'primitive',
    })
  })

  it('takes the first of a pair', () => {
    expect(
      readErrorFacts([new DeadError('first'), new Error('second')], realms),
    ).toStrictEqual({ message: 'first', realm: 'stale' })
    expect(readErrorFacts(['text', new Error('second')], realms)).toStrictEqual(
      {
        realm: 'primitive',
        message: 'text',
      },
    )
  })

  it('reads an object with no prototype', () => {
    expect(readErrorFacts(Object.create(null), realms)).toStrictEqual({
      message: 'Error',
      realm: 'other',
    })
  })

  it('gives the fallback for a proxy whose every trap throws', () => {
    expect(readErrorFacts(createThrowingProxy(), realms)).toStrictEqual({
      message: unreadable,
      realm: 'other',
    })
  })

  it('gives the fallback for a revoked proxy', () => {
    let { revoke, proxy } = Proxy.revocable({}, {})
    revoke()

    expect(readErrorFacts(proxy, realms)).toStrictEqual({
      message: unreadable,
      realm: 'other',
    })
  })

  it('gives the fallback for a pair whose first cannot be read', () => {
    let pair = new Proxy([], {
      get() {
        throw new Error('trap')
      },
    })

    expect(readErrorFacts(pair, realms)).toStrictEqual({
      message: unreadable,
      realm: 'other',
    })
  })

  it('keeps the realm when only the message cannot be read', () => {
    let error = new DeadError('hidden')
    Object.defineProperty(error, 'message', {
      get() {
        throw new Error('getter')
      },
    })

    expect(readErrorFacts(error, realms)).toStrictEqual({
      message: unreadable,
      realm: 'stale',
    })
  })

  it('never runs a constructor getter while it looks for a dead realm', () => {
    let error = Object.create({
      get constructor(): never {
        throw new Error('getter')
      },
    }) as object

    expect(readErrorFacts(error, realms)).toStrictEqual({
      message: 'Error',
      realm: 'other',
    })
  })
})
