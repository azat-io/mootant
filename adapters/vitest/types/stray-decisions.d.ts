/**
 * What the main process decided for the unhandled errors workers recorded in a
 * run (`readStrays`): the first line of an error that counts, or null for one
 * that does not, by the number of the error (`VitestStray.id`), by the path of
 * its out file. Each error is decided once, however often its out file is read
 * and however many tries recorded it.
 */
export type StrayDecisions = Map<string, Map<number, string | null>>
