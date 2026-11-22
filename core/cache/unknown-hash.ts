/**
 * Hash of a path that is neither a file nor a directory, such as a device, a
 * pipe or a socket, whose content cannot be read without waiting for it to end.
 * It differs from every hash and from the null of a missing file, and a verdict
 * that depends on such a path is neither reused nor stored.
 */
export const UNKNOWN_HASH = 'unknown'
