/**
 * Builds the marker of an object whose properties are getters that record each
 * read: the program worker replaces it in the input of every run, so the reads
 * of a program and their order are part of its output. The marker is plain
 * data, so it reaches the worker in a message.
 *
 * @param values - Value of each property.
 * @returns Marker of the object.
 */
export function createReader(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return { __reader: values }
}
