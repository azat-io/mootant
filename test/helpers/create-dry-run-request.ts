import type { DryRunRequest } from '../../types/adapter/dry-run-request'

/**
 * Builds a dry-run request.
 *
 * @param fields - Fields that differ.
 * @returns Request of an instrumented dry run of what may load `related`.
 */
export function createDryRunRequest(
  fields: Partial<DryRunRequest>,
): DryRunRequest {
  return {
    timeouts: { file: 60_000, test: 60_000 },
    instrumented: true,
    repeat: false,
    files: null,
    related: [],
    ...fields,
  }
}
