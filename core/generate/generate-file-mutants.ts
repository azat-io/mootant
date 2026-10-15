import type { Node } from 'oxc-parser'

import type { SkippedCandidate } from '../../types/mutant/skipped-candidate'
import type { MutantCandidate } from '../../types/mutant/mutant-candidate'
import type { PresetSettings } from '../../types/config/preset-settings'
import type { ActiveMutator } from '../../types/mutator/active-mutator'
import type { SkippedMutant } from '../../types/mutant/skipped-mutant'
import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { FileMutants } from '../../types/mutant/file-mutants'
import type { ParsedFile } from '../../types/source/parsed-file'
import type { IgnoreRule } from '../../types/mutant/ignore-rule'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { Mutant } from '../../types/mutant/mutant'

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
import { skipRules } from '../skips/skip-rules'
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
   * Whether the candidates that were considered and not emitted are listed;
   * false when omitted.
   */
  skipped?: boolean

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
 * Candidates of a file at the end of the pipeline, with what dropped the
 * others.
 */
interface Selection {
  /**
   * Candidates deduplication dropped, with the kept candidate each duplicates.
   */
  duplicates: ReadonlyMap<MutantCandidate, MutantCandidate>

  /**
   * Coarse candidates the solitary rule dropped, with the finer candidate that
   * dropped each.
   */
  solitary: ReadonlyMap<MutantCandidate, MutantCandidate>

  /**
   * Id of every candidate.
   */
  ids: ReadonlyMap<MutantCandidate, string>

  /**
   * Replacements the mutators and the collection did not accept.
   */
  collected: readonly SkippedCandidate[]

  /**
   * Candidates that become mutants, in canonical order.
   */
  kept: readonly MutantCandidate[]
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
 * or ignored ones with the reason and comment of their ignore rule. On request,
 * the candidates that a mutator, the collection, the solitary rule or
 * deduplication did not keep are listed as skipped, in canonical order, except
 * no-ops; they never change the mutants or their ids. Depends only on its
 * input.
 *
 * @param input - File, text, active mutators, preset settings and known mutator
 *   ids.
 * @returns Mutants in canonical order, skipped candidates and the problems of
 *   the file, without its absolute path, which the caller knows.
 */
export function generateFileMutants(
  input: GenerateFileInput,
): Omit<FileMutants, 'absolute'> {
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
      skipped: [],
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
  let collectedSkipped: SkippedCandidate[] = []
  for (let program of programs) {
    let rules = [
      ...program.rules,
      ...fileRules.filter(rule => !program.rules.includes(rule)),
    ].toSorted((left, right) => left.order - right.order)
    let collection = collectProgramCandidates(input, program, rules)
    diagnostics.push(...collection.diagnostics, ...program.diagnostics)
    collected.push(...collection.candidates)
    collectedSkipped.push(...collection.skipped)
  }

  let candidates = collected
    .filter(
      candidate =>
        candidate.text !== source.slice(candidate.start, candidate.end),
    )
    .toSorted(compareCandidates)
  let ids = assignMutantIds(candidates, file, source)
  let solitary =
    input.settings.coarseMutants ? null : applySolitaryRule(candidates)
  let deduplication = deduplicateCandidates(
    solitary?.kept ?? candidates,
    source,
  )
  let { kept } = deduplication

  return {
    skipped:
      input.skipped ?
        listSkipped(
          {
            collected: collectedSkipped.filter(
              candidate =>
                candidate.text !== source.slice(candidate.start, candidate.end),
            ),
            solitary: solitary?.dropped ?? new Map(),
            duplicates: deduplication.duplicates,
            kept,
            ids,
          },
          file,
        )
      : [],
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
 * Lists the candidates of a file that are not mutants: the replacements the
 * collection did not accept, the coarse candidates of the solitary rule and the
 * duplicates. A dropped candidate names the candidate that dropped it, with its
 * id when that candidate is a mutant.
 *
 * @param selection - Kept candidates, their ids and what dropped the others.
 * @param file - Display path of the file.
 * @returns Skipped mutants in canonical order.
 */
function listSkipped(selection: Selection, file: string): SkippedMutant[] {
  let { duplicates, collected, solitary, kept, ids } = selection
  let listed = new Set(kept)
  let dropped: SkippedCandidate[] = []

  /**
   * Builds the skipped candidate of a candidate that a later step dropped.
   *
   * @param candidate - Candidate that the solitary rule or deduplication
   *   dropped.
   * @param justifier - Candidate that made it redundant.
   * @param note - Rule and reason of the skip.
   * @returns Candidate with its range and text, the rule and the candidate that
   *   dropped it.
   */
  function createDropped(
    candidate: MutantCandidate,
    justifier: MutantCandidate,
    note: Pick<SkippedCandidate, 'reason' | 'rule'>,
  ): SkippedCandidate {
    return {
      by: {
        id: listed.has(justifier) ? ids.get(justifier)! : null,
        mutator: justifier.registered.id,
        start: justifier.start,
      },
      registered: candidate.registered,
      emission: candidate.emission,
      start: candidate.start,
      text: candidate.text,
      kind: candidate.kind,
      end: candidate.end,
      heuristic: false,
      ...note,
    }
  }

  for (let [candidate, inner] of solitary) {
    dropped.push(
      createDropped(candidate, inner, {
        reason: `a finer ${inner.registered.id} mutant lies inside the code it removes, and killing that mutant needs a test that observes this code`,
        rule: 'solitary',
      }),
    )
  }
  for (let [candidate, first] of duplicates) {
    dropped.push(
      createDropped(candidate, first, {
        reason: `it produces the same mutated file as an earlier ${first.registered.id} mutant`,
        rule: 'duplicate',
      }),
    )
  }

  return [...collected, ...dropped]
    .toSorted(compareCandidates)
    .map(candidate => ({
      ...skipRules[candidate.rule],
      heuristic: skipRules[candidate.rule].heuristic || candidate.heuristic,
      mutator: candidate.registered.id,
      replacement: candidate.text,
      reason: candidate.reason,
      start: candidate.start,
      rule: candidate.rule,
      kind: candidate.kind,
      end: candidate.end,
      by: candidate.by,
      file,
    }))
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
    skipped: input.skipped ?? false,
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
