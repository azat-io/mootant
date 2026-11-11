/**
 * What the tracker reads of the state of jest-circus.
 */
export interface CircusState {
  /**
   * Block that holds the tests and blocks at the top of the file.
   */
  rootDescribeBlock: CircusBlock

  /**
   * Milliseconds a test or hook without its own timeout may run.
   */
  testTimeout: number
}

/**
 * Block of tests.
 */
interface CircusBlock {
  /**
   * Tests and blocks in the order of their definition, until circus shuffles
   * them after `run_start`.
   */
  children: (CircusBlock | CircusTest)[]

  /**
   * Kind of the child.
   */
  type: 'describeBlock'

  /**
   * Name of the block.
   */
  name: string
}

/**
 * Test in the tree of blocks.
 */
interface CircusTest {
  /**
   * Kind of the child.
   */
  type: 'test'

  /**
   * Name of the test.
   */
  name: string
}
