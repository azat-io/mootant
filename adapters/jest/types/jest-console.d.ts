/**
 * Console of the tests of a unit, as Jest picks one: `buffer` keeps what tests
 * print for the results of the file, `stream` writes it at once, and `none`
 * drops it.
 */
export type JestConsole = 'buffer' | 'stream' | 'none'
