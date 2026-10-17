import type { Node } from 'oxc-parser'

import type { TemplateExpression } from '../../types/source/template-expression'
import type { RegisteredMutator } from '../../types/mutator/registered-mutator'
import type { SkippedCandidate } from '../../types/mutant/skipped-candidate'
import type { MutantCandidate } from '../../types/mutant/mutant-candidate'
import type { PresetSettings } from '../../types/config/preset-settings'
import type { ActiveMutator } from '../../types/mutator/active-mutator'
import type { SyntaxHelpers } from '../../types/syntax/syntax-helpers'
import type { SourceRange } from '../../types/source/source-range'
import type { Replacement } from '../../types/mutator/replacement'
import type { ParsedFile } from '../../types/source/parsed-file'
import type { SourceCode } from '../../types/source/source-code'
import type { IgnoreRule } from '../../types/mutant/ignore-rule'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { TypeHints } from '../../types/hints/type-hints'
import type { SkipNote } from '../../types/mutant/skip-note'

import { getSourcePosition } from '../text/get-source-position'
import { findCompilerPins } from '../syntax/find-compiler-pins'
import { readLiteralType } from '../syntax/read-literal-type'
import { validateReplacement } from './validate-replacement'
import { findIgnoreRule } from '../ignore/find-ignore-rule'
import { getReplacementKind } from './get-replacement-kind'
import { parseExpression } from '../text/parse-expression'
import { getScopePath } from '../identity/get-scope-path'
import { fitTemplateText } from './fit-template-text'
import { getSlot } from '../tree/get-slot'
import { pickFocus } from './pick-focus'

/**
 * Scope path of every candidate of a template.
 */
const TEMPLATE_SCOPE = '<template>'

/**
 * Skip of a replacement in a timer delay.
 */
const TIMER_DELAY_SKIP: SkipNote = {
  reason: 'a timer delay is not worth a test',
  rule: 'timer-delay',
}

/**
 * What the candidates of one file are collected from.
 */
interface CollectInput {
  /**
   * Code of a template in source order, or null for a script; null when
   * omitted.
   */
  expressions?: readonly TemplateExpression[] | null

  /**
   * Active mutators in canonical order.
   */
  mutators: readonly ActiveMutator[]

  /**
   * Nodes that only the synthetic module of a template has, or null for a
   * script; null when omitted.
   */
  hosts?: ReadonlySet<Node> | null

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
   * Whether skipped replacements are collected.
   */
  skipped: boolean

  /**
   * Runtime tree of the file.
   */
  tree: TreeIndex
}

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
 * Candidates of one file and the problems of its mutators.
 */
interface CandidateCollection {
  /**
   * Accepted replacements in the order the visitors returned them.
   */
  candidates: MutantCandidate[]

  /**
   * Replacements that were not accepted, in the order they were found: those a
   * visitor marked as skipped, invalid ones, those in a timer delay and,
   * without the `timeouts` setting, those of a value that advances a loop.
   * Empty unless requested.
   */
  skipped: SkippedCandidate[]

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
 * or replacement. A replacement that would move code its framework compiler
 * reads where it stands, such as a Svelte rune call or a Vue compiler macro, is
 * dropped. A replacement that only changes a literal in the delay of a known
 * timer call, such as `1000` turned into `1001`, is skipped as noise, even when
 * its visitor skipped it for another rule; a replacement there that touches a
 * name, a member read, a call or a guard stays a candidate. Without the
 * `timeouts` setting, a replacement of the value that advances a loop is
 * dropped. A replacement that a visitor marks as skipped is never validated and
 * never becomes a candidate; on request it is collected with its rule, like
 * dropped and invalid replacements, so that skipped replacements never change
 * the candidates. In a template only expressions are replaced: a replacement of
 * a statement, a declaration or a node of the synthetic module around the
 * template code is dropped without a trace, and every candidate has the scope
 * `<template>`. A replacement in a Vue template is fitted into the attribute
 * value or the interpolation around it, or skipped when it cannot be.
 *
 * @param input - Mutators, parsed file, runtime tree, ignore rules and shared
 *   context services.
 * @returns Candidates in emission order, mutator errors and skipped
 *   replacements.
 */
export function collectCandidates(input: CollectInput): CandidateCollection {
  let { services, mutators, parsed, rules, tree } = input
  let diagnostics: Diagnostic[] = []
  let candidates: MutantCandidate[] = []
  let skipped: SkippedCandidate[] = []

  /**
   * Keeps a replacement that is not accepted, when skipped replacements are
   * requested.
   *
   * @param registered - Mutator that returned the replacement.
   * @param replacement - Replacement that is not accepted.
   * @param note - Rule and reason of the skip.
   */
  function skip(
    registered: RegisteredMutator,
    replacement: Replacement,
    note: SkipNote,
  ): void {
    if (input.skipped) {
      let { by } = note
      skipped.push({
        by: by ? { start: by.node.start, mutator: by.mutator, id: null } : null,
        kind: getReplacementKind(replacement.node),
        heuristic: note.heuristic === true,
        start: replacement.node.start,
        end: replacement.node.end,
        emission: skipped.length,
        text: replacement.text,
        reason: note.reason,
        rule: note.rule,
        registered,
        ...pickFocus(replacement),
      })
    }
  }
  /**
   * Tells whether a replacement only changes a literal in a timer delay: the
   * value of the replaced node only reaches the delay of a known timer call,
   * and the node and the replacement are both literal-only expressions with a
   * value of the same type, such as `1000` turned into `1001` or `60 * 1000`
   * into `60 / 1000`. Its mutant can only change how long the timer waits.
   *
   * @param replacement - Replacement to check.
   * @returns Whether the replacement is skipped as a timer delay.
   */
  function isTimerDelay(replacement: Replacement): boolean {
    let { syntax } = services
    let { node, text } = replacement
    if (!syntax.isRuntimeNode(node) || !syntax.isTimerDelay(node)) {
      return false
    }
    let type = readLiteralType(node)
    if (type === null) {
      return false
    }
    let written = parseExpression(
      text,
      parsed.language === 'typescript' ? 'ts' : 'js',
    )
    return written !== null && readLiteralType(written) === type
  }
  let table = new Map<string, VisitorEntry[]>()
  let pins = findCompilerPins(tree, parsed.file)
  let hosts = input.hosts ?? null

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
        if (
          hosts !== null &&
          (hosts.has(replacement.node) ||
            getReplacementKind(replacement.node) !== 'expression')
        ) {
          continue
        }
        if (replacement.skip) {
          skip(
            registered,
            replacement,
            isTimerDelay(replacement) ? TIMER_DELAY_SKIP : replacement.skip,
          )
          continue
        }
        let violation = validateReplacement(
          tree,
          replacement.node,
          replacement.focus,
        )
        if (violation !== null) {
          diagnostics.push(
            createMutatorError(
              parsed,
              node,
              `Mutator "${registered.id}" ${violation}`,
            ),
          )
          skip(registered, replacement, {
            reason: `the mutator ${violation.slice(0, -1)}`,
            rule: 'invalid-target',
          })
          continue
        }
        let { start, end } = replacement.node
        let pin = pins.find(
          entry =>
            start <= entry.start &&
            entry.end <= end &&
            entry.region.start <= start &&
            end <= entry.region.end,
        )
        if (pin) {
          skip(registered, replacement, {
            rule: 'compiler-macro',
            reason: pin.reason,
          })
          continue
        }
        let delimiter = input.expressions?.findLast(
          expression => expression.start <= start,
        )?.delimiter
        let fit =
          delimiter === undefined ?
            { text: replacement.text, kind: 'fit' as const }
          : fitTemplateText(
              replacement.text,
              delimiter,
              parsed.language === 'typescript' ? 'ts' : 'js',
            )
        if (fit.kind === 'unfit') {
          skip(registered, replacement, {
            rule: 'template-text',
            reason: fit.reason,
          })
          continue
        }
        if (isTimerDelay(replacement)) {
          skip(registered, replacement, TIMER_DELAY_SKIP)
          continue
        }
        if (
          !services.settings.timeouts &&
          services.syntax.isLoopAdvanceValue(replacement.node)
        ) {
          skip(registered, replacement, {
            reason:
              'it changes the value that advances a loop, so only a timeout could kill it',
            rule: 'loop-advance',
          })
          continue
        }
        candidates.push({
          ignoreRule: findIgnoreRule(rules, {
            line: getSourcePosition(parsed.lineStarts, start).line,
            mutator: registered.id,
            start,
          }),
          scope:
            hosts === null ?
              getScopePath(tree, replacement.node)
            : TEMPLATE_SCOPE,
          solitary: getSolitaryRanges(replacement.solitary),
          kind: getReplacementKind(replacement.node)!,
          emission: candidates.length,
          text: fit.text,
          registered,
          start,
          end,
          ...pickFocus(replacement),
        })
      }
    }
  }

  return { diagnostics, candidates, skipped }
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
