import type { WorkerProject } from './worker-project'

/**
 * Project as a worker holds it once it booted.
 */
export interface BootedProject extends WorkerProject {
  /**
   * The copy of the configuration a unit runs, by the path of its switch plan.
   * A copy costs a stringify of a big configuration when Jest hashes it, and
   * the plan path decides its identity.
   */
  wrapped: Map<string | null, object>

  /**
   * Jest's haste map of the project.
   */
  moduleMap: unknown

  /**
   * Jest's resolver of the project, made at boot: on Jest 29.7 making one loads
   * graceful-fs, which patches `fs.close`, and doing that in a unit would dirty
   * the first unit of every worker. Calls of its methods are counted
   * (`countResolverCalls`).
   */
  resolver: unknown
}
