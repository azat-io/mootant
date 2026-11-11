/**
 * Key of the worker's channel on `process`: a test's vm gets a copy of it that
 * holds what a symbol key holds as it is, so the vm reaches the same object,
 * and the bundle of the vm's setup has no module in common with the worker's.
 */
export const CHANNEL_SLOT = Symbol.for('mootant.channel')
