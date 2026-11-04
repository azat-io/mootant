import { vi } from 'vitest'

export function loadActual(specifier) {
  return vi.importActual(specifier)
}
