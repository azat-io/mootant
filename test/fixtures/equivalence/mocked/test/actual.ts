import { vi } from 'vitest'

export function loadActual(
  specifier: string,
): Promise<Record<string, unknown>> {
  return vi.importActual(specifier)
}
