import type { MutantRuntime } from '../../../types/adapter/mutant-runtime'

/**
 * What `vm-setup` registers on the channel from inside a test's vm, for the
 * worker to read and stop what the vm left.
 */
export interface VmSide {
  /**
   * Adds a variable the code made something else read, such as `*` for a child
   * process that gets the variables of the worker.
   */
  addVariable(name: string): void

  /**
   * `Error` of the vm, which tells the errors of this unit from others.
   */
  realmError: ErrorConstructor

  /**
   * Names of the environment variables the code read, `*` for a listing.
   */
  listVariables(): string[]

  /**
   * Mutant runtime of the vm.
   */
  runtime: MutantRuntime

  /**
   * Whether the active mutant was reached in the unit; never reset.
   */
  isReached(): boolean

  /**
   * Clears every timer the vm started through its wrapped functions.
   */
  stopTimers(): void

  /**
   * Turns the runtime off: a later `hit` returns false, counts nothing and
   * writes nothing.
   */
  close(): void
}
