export const LIMIT = 3 * 2

export const NAMES = ['a', 'b'].map(name => name.toUpperCase())

export const SETTINGS = Object.freeze({ retries: LIMIT > 5 ? 2 : 0 })
