import type {
  TestSequencerConstructor,
  TestSpecification,
  Vitest,
} from 'vitest/node'

/**
 * Wraps the sequencer of a Vitest instance so that specifications of the same
 * test file, the units of one file in a mootant run, are spread out: after the
 * given sequencer sorted them, they are taken in turns, one per test file and
 * project, in the order each file first appears. A unit waits for the unit
 * before it of the same file, so spreading them lets other test files use the
 * workers meanwhile. A run with one specification per file keeps its order.
 *
 * @param Base - Sequencer class the instance was configured with.
 * @returns Sequencer class to put in its place.
 */
export function createInterleavedSequencer(
  Base: TestSequencerConstructor,
): TestSequencerConstructor {
  return class InterleavedSequencer {
    /**
     * Instance of the wrapped sequencer.
     */
    private readonly base: InstanceType<TestSequencerConstructor>

    /**
     * Creates the wrapped sequencer.
     *
     * @param context - Vitest instance.
     */
    public constructor(context: Vitest) {
      this.base = new Base(context)
    }

    /**
     * Sorts with the wrapped sequencer, then takes the specifications of each
     * test file in turns.
     *
     * @param files - Specifications of the run.
     * @returns Specifications in run order.
     */
    public async sort(
      files: TestSpecification[],
    ): Promise<TestSpecification[]> {
      let groups = new Map<string, TestSpecification[]>()
      let sorted = await this.base.sort(files)
      for (let specification of sorted) {
        let key = `${specification.project.name}\n${specification.moduleId}`
        let group = groups.get(key) ?? []
        groups.set(key, group)
        group.push(specification)
      }
      let lists = [...groups.values()]
      let longest = Math.max(0, ...lists.map(list => list.length))
      return Array.from({ length: longest }, (_, index) =>
        lists.flatMap(list => list.slice(index, index + 1)),
      ).flat()
    }

    /**
     * Shards with the wrapped sequencer.
     *
     * @param files - Specifications of the run.
     * @returns Specifications of this shard.
     */
    public async shard(
      files: TestSpecification[],
    ): Promise<TestSpecification[]> {
      return this.base.shard(files)
    }
  }
}
