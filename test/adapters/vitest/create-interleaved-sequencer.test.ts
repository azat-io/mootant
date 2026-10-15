import type { TestSpecification, Vitest } from 'vitest/node'

import { describe, expect, it } from 'vitest'

import { createInterleavedSequencer } from '../../../adapters/vitest/create-interleaved-sequencer'

/**
 * Sequencer that reverses the order, and shards to the first specifications.
 */
class ReversingSequencer {
  /**
   * Context the sequencer was created with.
   */
  public readonly context: Vitest

  /**
   * Specifications a shard keeps.
   */
  private readonly shardSize = 1

  /**
   * Keeps the context.
   *
   * @param context - Vitest instance.
   */
  public constructor(context: Vitest) {
    this.context = context
  }

  /**
   * Reverses the specifications, after the first ones when sharded.
   *
   * @param files - Specifications.
   * @returns Specifications in reverse order.
   */
  public sort(files: TestSpecification[]): TestSpecification[] {
    return [
      ...files.slice(0, this.shardSize - 1),
      ...files.slice(this.shardSize - 1).toReversed(),
    ]
  }

  /**
   * Keeps the first specifications.
   *
   * @param files - Specifications.
   * @returns The first specifications.
   */
  public shard(files: TestSpecification[]): TestSpecification[] {
    return files.slice(0, this.shardSize)
  }
}

/**
 * Creates a fake specification.
 *
 * @param project - Name of its project.
 * @param moduleId - Test file.
 * @param unit - Label to tell units of one file apart.
 * @returns Specification with the fields the sequencer reads.
 */
function createSpecification(
  project: string,
  moduleId: string,
  unit: number,
): TestSpecification {
  return { project: { name: project }, moduleId, unit } as never
}

describe('createInterleavedSequencer', () => {
  it('takes the units of each test file in turns after sorting', async () => {
    let Sequencer = createInterleavedSequencer(ReversingSequencer)
    let sequencer = new Sequencer({} as Vitest)
    let a0 = createSpecification('', '/a.test.ts', 0)
    let a1 = createSpecification('', '/a.test.ts', 1)
    let a2 = createSpecification('', '/a.test.ts', 2)
    let b0 = createSpecification('', '/b.test.ts', 0)
    let c0 = createSpecification('unit', '/a.test.ts', 0)

    await expect(sequencer.sort([c0, b0, a2, a1, a0])).resolves.toStrictEqual([
      a0,
      b0,
      c0,
      a1,
      a2,
    ])
    await expect(sequencer.sort([])).resolves.toStrictEqual([])
    await expect(sequencer.shard([a0, b0])).resolves.toStrictEqual([a0])
  })
})
