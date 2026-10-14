import type { Node } from 'oxc-parser'

import type { MutantCandidate } from '../../types/mutant-candidate'
import type { PresetSettings } from '../../types/preset-settings'
import type { ScopeAnalysis } from '../../types/scope-analysis'
import type { ActiveMutator } from '../../types/active-mutator'
import type { FileMutants } from '../../types/file-mutants'
import type { ParsedFile } from '../../types/parsed-file'
import type { IgnoreRule } from '../../types/ignore-rule'
import type { Diagnostic } from '../../types/diagnostic'
import type { TreeIndex } from '../../types/tree-index'
import type { Mutant } from '../../types/mutant'

import { createSyntacticTypeProvider } from '../hints/create-syntactic-type-provider'
import { parseIgnoreDirectives } from '../ignore/parse-ignore-directives'
import { createSyntaxHelpers } from '../syntax/create-syntax-helpers'
import { createIgnoreRules } from '../ignore/create-ignore-rules'
import { deduplicateCandidates } from './deduplicate-candidates'
import { getSourcePosition } from '../text/get-source-position'
import { assignMutantIds } from '../identity/assign-mutant-ids'
import { createSourceCode } from '../text/create-source-code'
import { getSourceBlocks } from '../parser/get-source-blocks'
import { createTypeHints } from '../hints/create-type-hints'
import { findIgnoreRule } from '../ignore/find-ignore-rule'
import { applySolitaryRule } from './apply-solitary-rule'
import { collectCandidates } from './collect-candidates'
import { compareCandidates } from './compare-candidates'
import { analyzeScopes } from '../hints/analyze-scopes'
import { parseFile } from '../parser/parse-file'
import { indexTree } from '../tree/index-tree'

/**
 * One file to generate mutants for, with the mutators of the run.
 */
interface GenerateFileInput {
  /**
   * Every registered mutator id, active or not, for checking the ids that
   * ignore directives list.
   */
  knownMutatorIds: ReadonlySet<string>

  /**
   * Resolved settings of the preset.
   */
  settings: Readonly<PresetSettings>

  /**
   * Active mutators in canonical order.
   */
  mutators: readonly ActiveMutator[]

  /**
   * Text of the file as read from disk.
   */
  source: string

  /**
   * Display path of the file, also hashed into mutant ids.
   */
  file: string
}

/**
 * Program of a file that parsed, with what its mutators need.
 */
interface PreparedProgram {
  /**
   * Warnings about the ignore directives of the program.
   */
  diagnostics: Diagnostic[]

  /**
   * Scope analysis of the program.
   */
  scopes: ScopeAnalysis

  /**
   * Ignore rules of the directives in the program.
   */
  rules: IgnoreRule[]

  /**
   * Parsed program.
   */
  parsed: ParsedFile

  /**
   * Runtime tree of the program.
   */
  tree: TreeIndex
}

/**
 * Generates the mutants of one file. A JavaScript or TypeScript file is one
 * program; each script block of a Vue, Svelte or Astro component is its own
 * program with its own tree, scopes, hints and ignore directives, except that a
 * `mootant-ignore-file` directive in any block covers every block. A block that
 * fails to parse is reported and the other blocks are still mutated. Ignore
 * directives are read first, so mutators know which mutants will run; then the
 * mutators collect candidates, no-ops are dropped, the candidates of every
 * block are sorted together and every candidate gets its id before the solitary
 * rule drops coarse ones, unless the `coarseMutants` setting is on, and
 * deduplication drops duplicate ones. Kept candidates become pending mutants,
 * or ignored ones with the reason and comment of their ignore rule. Depends
 * only on its input.
 *
 * @param input - File, text, active mutators, preset settings and known mutator
 *   ids.
 * @returns Mutants in canonical order and the problems of the file.
 */
export function generateFileMutants(input: GenerateFileInput): FileMutants {
  let { knownMutatorIds, source, file } = input
  let parseDiagnostics: Diagnostic[] = []
  let programs: PreparedProgram[] = []
  for (let block of getSourceBlocks(file, source)) {
    let outcome = parseFile(file, block.text, block)
    if (outcome.kind === 'failed') {
      parseDiagnostics.push(...outcome.diagnostics)
    } else {
      programs.push(prepareProgram(outcome.parsed, knownMutatorIds))
    }
  }
  if (programs.length === 0 && parseDiagnostics.length > 0) {
    return {
      diagnostics: parseDiagnostics,
      parsed: false,
      mutants: [],
      source,
      file,
    }
  }

  let fileRules = programs.flatMap(program =>
    program.rules.filter(rule => rule.kind === 'file'),
  )
  let diagnostics = [...parseDiagnostics]
  let collected: MutantCandidate[] = []
  for (let program of programs) {
    let rules = [
      ...program.rules,
      ...fileRules.filter(rule => !program.rules.includes(rule)),
    ].toSorted((left, right) => left.order - right.order)
    let collection = collectProgramCandidates(input, program, rules)
    diagnostics.push(...collection.diagnostics, ...program.diagnostics)
    collected.push(...collection.candidates)
  }

  let candidates = collected
    .filter(
      candidate =>
        candidate.text !== source.slice(candidate.start, candidate.end),
    )
    .toSorted(compareCandidates)
  let ids = assignMutantIds(candidates, file, source)
  let kept = deduplicateCandidates(
    input.settings.coarseMutants ? candidates : applySolitaryRule(candidates),
    source,
  )

  return {
    mutants: kept.map(candidate =>
      createMutant(candidate, ids.get(candidate)!, file),
    ),
    parsed: true,
    diagnostics,
    source,
    file,
  }
}

/**
 * Runs the active mutators over one program.
 *
 * @param input - File, active mutators and preset settings of the run.
 * @param program - Program with its tree and scopes.
 * @param rules - Ignore rules that cover the program.
 * @returns Candidates of the program and the errors of failing mutators.
 */
function collectProgramCandidates(
  input: GenerateFileInput,
  program: PreparedProgram,
  rules: readonly IgnoreRule[],
): ReturnType<typeof collectCandidates> {
  let { settings, mutators } = input
  let { parsed, scopes, tree } = program
  let activeIds = new Set(mutators.map(active => active.id))
  return collectCandidates({
    services: {
      isActive(id: string, node: Node): boolean {
        return (
          activeIds.has(id) &&
          findIgnoreRule(rules, {
            line: getSourcePosition(parsed.lineStarts, node.start).line,
            start: node.start,
            mutator: id,
          }) === null
        )
      },
      hints: createTypeHints(createSyntacticTypeProvider(parsed, tree, scopes)),
      isEnabled(id: string): boolean {
        return activeIds.has(id)
      },
      sourceCode: createSourceCode(parsed, tree, scopes),
      syntax: createSyntaxHelpers(tree, scopes),
      settings,
    },
    mutators,
    parsed,
    rules,
    tree,
  })
}

/**
 * Turns a kept candidate into a mutant with its status.
 *
 * @param candidate - Candidate that survived the solitary rule and
 *   deduplication.
 * @param id - Id assigned to the candidate.
 * @param file - Display path of the file.
 * @returns Pending mutant, or an ignored one with the reason and comment of the
 *   rule that covers it.
 */
function createMutant(
  candidate: MutantCandidate,
  id: string,
  file: string,
): Mutant {
  let rule = candidate.ignoreRule
  return {
    ignoredBy: rule === null ? null : rule.source,
    status: rule === null ? 'Pending' : 'Ignored',
    reason: rule === null ? null : rule.reason,
    mutator: candidate.registered.id,
    replacement: candidate.text,
    scope: candidate.scope,
    start: candidate.start,
    kind: candidate.kind,
    end: candidate.end,
    file,
    id,
  }
}

/**
 * Builds what the mutators of one program need besides the ignore rules of the
 * other programs: its tree, scopes and own ignore rules.
 *
 * @param parsed - Program that parsed.
 * @param knownMutatorIds - Every registered mutator id.
 * @returns The program with its tree, scopes, rules and directive warnings.
 */
function prepareProgram(
  parsed: ParsedFile,
  knownMutatorIds: ReadonlySet<string>,
): PreparedProgram {
  let directiveParse = parseIgnoreDirectives(parsed, knownMutatorIds)
  let ruleCreation = createIgnoreRules(parsed, directiveParse.directives)
  return {
    diagnostics: [...directiveParse.diagnostics, ...ruleCreation.diagnostics],
    scopes: analyzeScopes(parsed.program),
    tree: indexTree(parsed.program),
    rules: ruleCreation.rules,
    parsed,
  }
}
