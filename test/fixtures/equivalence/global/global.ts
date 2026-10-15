import type { TestProject } from 'vitest/node'

import { port } from './src/port'

export default function setup(project: TestProject): void {
  project.provide('port', port())
}

declare module 'vitest' {
  export interface ProvidedContext {
    port: number
  }
}
