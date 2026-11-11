/**
 * Where a thrown value comes from: `primitive` for what is no object or
 * function, as a timeout of circus is; `host` for an error of the worker's own
 * realm; `current` for one of the vm of the running unit; `stale` for one of
 * the vm of a unit that ended; `other` for the rest.
 */
export type ErrorRealm = 'primitive' | 'current' | 'stale' | 'other' | 'host'
