/**
 * Lists the inputs where a program differs from the original.
 *
 * @param original - Outputs of the original program, in input order.
 * @param outputs - Outputs of the program to compare, in input order.
 * @returns Indexes of the differing inputs.
 */
export function getKillSet(original: string[], outputs: string[]): Set<number> {
  let kills = new Set<number>()
  for (let [input, output] of outputs.entries()) {
    if (output !== original[input]) {
      kills.add(input)
    }
  }
  return kills
}
