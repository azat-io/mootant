import type { Node } from 'oxc-parser'

import type { MutantCandidate } from '../../types/mutant-candidate'
import type { PresetSettings } from '../../types/preset-settings'
import type { SyntaxHelpers } from '../../types/syntax-helpers'
import type { ActiveMutator } from '../../types/active-mutator'
import type { SourceRange } from '../../types/source-range'
import type { Replacement } from '../../types/replacement'
import type { ParsedFile } from '../../types/parsed-file'
import type { SourceCode } from '../../types/source-code'
import type { IgnoreRule } from '../../types/ignore-rule'
import type { Diagnostic } from '../../types/diagnostic'
import type { TreeIndex } from '../../types/tree-index'
import type { TypeHints } from '../../types/type-hints'

import { getSourcePosition } from '../text/get-source-position'
import { validateReplacement } from './validate-replacement'
import { findIgnoreRule } from '../ignore/find-ignore-rule'
import { getReplacementKind } from './get-replacement-kind'
import { getScopePath } from '../identity/get-scope-path'
import { getSlot } from '../tree/get-slot'

/**
 * Parts of every mutator context that all mutators of a file share.
 */
interface MutatorServices {
  /**
   * Tells whether a mutant of the mutator with the given id that replaces the
   * node will run.
   */
  isActive(id: string, node: Node): boolean

  /**
   * Resolved settings of the preset, frozen.
   */
  settings: Readonly<PresetSettings>

  /**
   * Tells whether the preset turned on the mutator with the given id.
   */
  isEnabled(id: string): boolean

  /**
   * Text, comments, tree and text builders of the file.
   */
  sourceCode: SourceCode

  /**
   * Questions about the syntactic position of a node.
   */
  syntax: SyntaxHelpers

  /**
   * What is known about the runtime types of expressions.
   */
  hints: TypeHints
}

/**
 * What the candidates of one file are collected from.
 */
interface CollectInput {
  /**
   * Active mutators in canonical order.
   */
  mutators: readonly ActiveMutator[]

  /**
   * Ignore rules of the file, which decide the status of each candidate.
   */
  rules: readonly IgnoreRule[]

  /**
   * Shared parts of the mutator contexts.
   */
  services: MutatorServices

  /**
   * Parsed file.
   */
  parsed: ParsedFile

  /**
   * Runtime tree of the file.
   */
  tree: TreeIndex
}

/**
 * Candidates of one file and the problems of its mutators.
 */
interface CandidateCollection {
  /**
   * Accepted replacements in the order the visitors returned them.
   */
  candidates: MutantCandidate[]

  /**
   * Mutator errors: a throwing `create` or visitor, or an invalid replacement.
   */
  diagnostics: Diagnostic[]
}

/**
 * Visitor of one mutator for one node type.
 */
interface VisitorEntry {
  /**
   * Visitor function as the mutator returned it.
   */
  visit(node: Node, parent: Node | null): readonly Replacement[]

  /**
   * Mutator that returned the visitor.
   */
  registered: ActiveMutator
}

/**
 * Runs the active mutators over the runtime tree of a file. Each mutator
 * creates its visitors once, in rank order; then every dispatched node is
 * passed, in pre-order, to the visitors registered for its type. Each returned
 * replacement is validated and becomes a candidate with its kind, scope path,
 * solitary ranges and ignore rule. A throwing `create` or visitor and an
 * invalid replacement become mutator errors and cost only that mutator, visit
 * or replacement. Without the `timeouts` setting, a replacement of the value
 * that advances a loop is dropped.
 *
 * @param input - Mutators, parsed file, runtime tree, ignore rules and shared
 *   context services.
 * @returns Candidates in emission order and mutator errors.
 */
export function collectCandidates(input: CollectInput): CandidateCollection {
  let { services, mutators, parsed, rules, tree } = input
  let diagnostics: Diagnostic[] = []
  let candidates: MutantCandidate[] = []
  let table = new Map<string, VisitorEntry[]>()

  for (let registered of mutators) {
    let visitors: Record<string, VisitorEntry['visit']>
    try {
      visitors = registered.mutator.create({
        ...services,
        options: registered.options,
        id: registered.id,
        file: parsed.file,
      })
    } catch (error) {
      diagnostics.push(
        createMutatorError(
          parsed,
          null,
          `Mutator "${registered.id}" failed while preparing the file: ${(error as Error).message}`,
        ),
      )
      continue
    }
    for (let [type, visit] of Object.entries(visitors)) {
      let entries = table.get(type)
      if (!entries) {
        entries = []
        table.set(type, entries)
      }
      entries.push({ registered, visit })
    }
  }

  for (let node of tree.order) {
    let entries = table.get(node.type)
    if (!entries) {
      continue
    }
    let { parent } = getSlot(tree, node)
    for (let { registered, visit } of entries) {
      let replacements: readonly Replacement[]
      try {
        replacements = visit(node, parent)
      } catch (error) {
        diagnostics.push(
          createMutatorError(
            parsed,
            node,
            `Mutator "${registered.id}" failed on ${node.type}: ${(error as Error).message}`,
          ),
        )
        continue
      }
      for (let replacement of replacements) {
        let violation = validateReplacement(tree, replacement.node)
        if (violation !== null) {
          diagnostics.push(
            createMutatorError(
              parsed,
              node,
              `Mutator "${registered.id}" ${violation}`,
            ),
          )
          continue
        }
        if (
          !services.settings.timeouts &&
          services.syntax.isLoopAdvanceValue(replacement.node)
        ) {
          continue
        }
        let { start, end } = replacement.node
        candidates.push({
          ignoreRule: findIgnoreRule(rules, {
            line: getSourcePosition(parsed.lineStarts, start).line,
            mutator: registered.id,
            start,
          }),
          solitary: getSolitaryRanges(replacement.solitary),
          kind: getReplacementKind(replacement.node)!,
          scope: getScopePath(tree, replacement.node),
          emission: candidates.length,
          text: replacement.text,
          registered,
          start,
          end,
        })
      }
    }
  }

  return { diagnostics, candidates }
}

/**
 * Builds a mutator error of the file.
 *
 * @param parsed - Parsed file.
 * @param node - Visited node the error is reported at, or null for an error
 *   without a position.
 * @param message - Sentence that names the mutator and the problem.
 * @returns Error diagnostic with the code `mutator-error`.
 */
function createMutatorError(
  parsed: ParsedFile,
  node: Node | null,
  message: string,
): Diagnostic {
  let position =
    node === null ? null : getSourcePosition(parsed.lineStarts, node.start)
  return {
    column: position?.column ?? null,
    line: position?.line ?? null,
    code: 'mutator-error',
    file: parsed.file,
    severity: 'error',
    message,
  }
}

/**
 * Turns the solitary nodes of a replacement into ranges.
 *
 * @param nodes - Nodes whose effect the mutant removes as a whole, if any.
 * @returns Their ranges, or null when the replacement names none.
 */
function getSolitaryRanges(
  nodes: readonly Node[] | undefined,
): SourceRange[] | null {
  if (!nodes || nodes.length === 0) {
    return null
  }
  return nodes.map(({ start, end }) => ({ start, end }))
}
