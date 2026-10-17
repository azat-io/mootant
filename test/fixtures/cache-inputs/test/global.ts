import type { TestProject } from 'vitest/node'

import { seed } from './seed'

export default function setup(project: TestProject): void {
  project.provide('seed', seed)
}
