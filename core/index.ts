export type {
  IsolatedResult,
  IsolatedFacts,
} from '../types/adapter/isolated-result'
export type {
  BatchPlan,
  BatchUnit,
  BatchTest,
} from '../types/adapter/batch-plan'
export type { IsolatedPlan, IsolatedUnit } from '../types/adapter/isolated-plan'
export { resolveSwitchedText } from './instrument/resolve-switched-text'
export type { MutatorVisitors } from '../types/mutator/mutator-visitors'
export type { MutatorContext } from '../types/mutator/mutator-context'
export type { MutatorSetting } from '../types/mutator/mutator-setting'
export type { AdapterSession } from '../types/adapter/adapter-session'
export type { AdapterContext } from '../types/adapter/adapter-context'
export type { PresetSettings } from '../types/config/preset-settings'
export type { DryRunRequest } from '../types/adapter/dry-run-request'
export type { MutantRuntime } from '../types/adapter/mutant-runtime'
export type { DryRunResult } from '../types/adapter/dry-run-result'
export type { SwitchedFile } from '../types/adapter/switched-file'
export type { MutatorMeta } from '../types/mutator/mutator-meta'
export type { BatchResult } from '../types/adapter/batch-result'
export type { TestAdapter } from '../types/adapter/test-adapter'
export type { Replacement } from '../types/mutator/replacement'
export type { TryLimits } from '../types/adapter/try-limits'
export type { TryVerdict } from '../types/run/try-verdict'
export type { TryFacts } from '../types/adapter/try-facts'
export type { DryFile } from '../types/adapter/dry-file'
export type { DryTest } from '../types/adapter/dry-test'
export type { Mutator } from '../types/mutator/mutator'
export type { TryCause } from '../types/run/try-cause'
export { defineConfig } from './config/define-config'
export type { Config } from '../types/config/config'
export type { Plugin } from '../types/config/plugin'
export type { Preset } from '../types/config/preset'
export { classifyTry } from './run/classify-try'
