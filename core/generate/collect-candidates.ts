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
import type { ListRemoval } from '../../types/mutant/list-removal'
import type { ParsedFile } from '../../types/source/parsed-file'
import type { SourceCode } from '../../types/source/source-code'
import type { MutantHost } from '../../types/mutant/mutant-host'
import type { IgnoreRule } from '../../types/mutant/ignore-rule'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { TypeHints } from '../../types/hints/type-hints'
import type { TextEdit } from '../../types/source/text-edit'
import type { SkipNote } from '../../types/mutant/skip-note'

import { getComponentFramework } from '../parser/get-component-framework'
import { getListRemovalRange } from '../text/get-list-removal-range'
import { getSourcePosition } from '../text/get-source-position'
import { findCompilerPins } from '../syntax/find-compiler-pins'
import { removeListElement } from '../text/remove-list-element'
import { readLiteralType } from '../syntax/read-literal-type'
import { validateReplacement } from './validate-replacement'
import { findIgnoreRule } from '../ignore/find-ignore-rule'
import { getReplacementKind } from './get-replacement-kind'
import { parseExpression } from '../text/parse-expression'
import { getScopePath } from '../identity/get-scope-path'
import { groupReplacement } from './group-replacement'
import { fitTemplateText } from './fit-template-text'
import { findListRemoval } from './find-list-removal'
import { getMutantSite } from './get-mutant-site'
import { getSlot } from '../tree/get-slot'
import { pickFocus } from './pick-focus'

/**
 * Scope path of every candidate of a template.
 */
const TEMPLATE_SCOPE = '<template>'

/**
 * Most copies of one literal that removals which replace the whole literal may
 * take; above it, none of them becomes a mutant, so the switched file and the
 * reports hold at most this many copies of the literal for them.
 */
const MAX_LITERAL_COPIES = 8

/**
 * Skip of a replacement in a timer delay.
 */
const TIMER_DELAY_SKIP: SkipNote = {
  reason: 'it only changes a timer delay',
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
 * solitary ranges and ignore rule, which ignore directives decide where it is
 * placed (see `getMutantSite`). A throwing `create` or visitor and an invalid
 * replacement become mutator errors and cost only that mutator, visit or
 * replacement. A replacement that would move code its framework compiler reads
 * where it stands, such as a Svelte rune call or a Vue compiler macro, is
 * dropped. A replacement that only changes a literal in the delay of a known
 * timer call, such as `1000` turned into `1001`, is skipped as noise, even when
 * its visitor skipped it for another rule; a replacement there that touches a
 * name, a member read, a call or a guard stays a candidate. Without the
 * `timeouts` setting, a replacement of the value that advances a loop is
 * dropped, except a removed `?.`: optional-chaining decides that itself, since
 * only it knows which link it removes. A replacement that a visitor marks as
 * skipped is never validated and never becomes a candidate; on request it is
 * collected with its rule, like dropped and invalid replacements, so that
 * skipped replacements never change the candidates. In a template only
 * expressions are replaced: a replacement of a statement, a declaration or a
 * node of the synthetic module around the template code is dropped without a
 * trace, and every candidate has the scope `<template>`. A replacement in a Vue
 * template is fitted into the attribute value or the interpolation around it,
 * or skipped when it cannot be.
 *
 * A replacement with an empty text for an element of an array literal or a
 * member of an object literal removes that element (see `findListRemoval`). Its
 * candidate replaces only the element with the comma next to it (see
 * `getListRemovalRange`), with the element as its focus, and is hosted with the
 * other removals of its literal. A removal that is not narrowed replaces the
 * whole literal instead, which takes a copy of the literal per removal; when a
 * literal has more than eight such removals, none of them becomes a candidate,
 * and each is skipped in the narrowed shape, without a copy. Every check that
 * looks at the replaced node, such as the template filter, compiler pins and
 * loop advances, looks at the literal of a removal, as it does for the whole
 * literal. In a Vue template, a removal that would join the text around it into
 * the delimiter of the template code is skipped.
 *
 * @param input - Mutators, parsed file, runtime tree, ignore rules and shared
 *   context services.
 * @returns Candidates in emission order, mutator errors and skipped
 *   replacements.
 */
export function collectCandidates(input: CollectInput): CandidateCollection {
  /**
   * Range and text that a replacement gives its candidate, with how the mutant
   * switch would host it; the kind is null when it cannot.
   */
  type Change = ({ focus?: TextEdit; kind: null } | MutantHost) & TextEdit

  let { services, parsed, rules, tree } = input
  let lang: 'js' | 'ts' = parsed.language === 'typescript' ? 'ts' : 'js'
  let diagnostics: Diagnostic[] = []
  let candidates: MutantCandidate[] = []
  let skipped: SkippedCandidate[] = []

  /**
   * Keeps a replacement that is not accepted, when skipped replacements are
   * requested.
   *
   * @param registered - Mutator that returned the replacement.
   * @param change - Range, text, kind and focus of the replacement.
   * @param note - Rule and reason of the skip.
   */
  function skip(
    registered: RegisteredMutator,
    change: Change,
    note: SkipNote,
  ): void {
    if (input.skipped) {
      let { by } = note
      skipped.push({
        by: by ? { start: by.node.start, mutator: by.mutator, id: null } : null,
        heuristic: note.heuristic === true,
        emission: skipped.length,
        start: change.start,
        reason: note.reason,
        kind: change.kind,
        text: change.text,
        end: change.end,
        rule: note.rule,
        registered,
        ...pickFocus(change),
      })
    }
  }
  /**
   * Reads what a replacement writes: the range and text of its node, grouped
   * for its slot (see `groupReplacement`), or, for a removal, the element with
   * the comma next to it and an empty text, or the whole literal without the
   * element when the removal replaces the whole literal.
   *
   * @param registered - Mutator that returned the replacement.
   * @param replacement - Replacement the visitor returned.
   * @param removal - Removal the replacement asks for, or null.
   * @returns Range, text and how the change is hosted.
   */
  function readChange(
    registered: ActiveMutator,
    replacement: Replacement,
    removal: ListRemoval | null,
  ): Change {
    if (removal?.narrow) {
      let { start, end } = replacement.node
      return {
        ...getListRemovalRange(parsed, removal.list, removal.index),
        list: { start: removal.list.start, end: removal.list.end },
        focus: { text: '', start, end },
        kind: removal.kind,
        text: '',
      }
    }
    let written: Replacement =
      removal === null ? replacement : (
        {
          text: removeListElement(parsed, removal.list, removal.index),
          node: removal.list,
        }
      )
    let { node, text } = groupReplacement(
      written,
      { parsed, tree },
      registered.id.includes('/'),
    )
    return {
      kind: getReplacementKind(node),
      start: node.start,
      end: node.end,
      text,
      ...pickFocus(written),
    }
  }
  /**
   * Tells whether a replacement only changes a literal in a timer delay: the
   * value of the replaced node only reaches the delay of a known timer call,
   * and the node and the replacement are both literal-only expressions with a
   * value of the same type, such as `1000` turned into `1001` or `60 * 1000`
   * into `60 / 1000`. Its mutant can only change how long the timer waits.
   *
   * @param node - Replaced node.
   * @param text - Text written in place of the node.
   * @returns Whether the replacement is skipped as a timer delay.
   */
  function isTimerDelay(node: Node, text: string): boolean {
    let { syntax } = services
    if (!syntax.isRuntimeNode(node) || !syntax.isTimerDelay(node)) {
      return false
    }
    let type = readLiteralType(node)
    if (type === null) {
      return false
    }
    let written = parseExpression(text, lang)
    return written !== null && readLiteralType(written) === type
  }
  /**
   * Fits the text of a change into the Vue template code around it: the text
   * itself, or, for a narrowed removal, the text it joins, the characters
   * before and after the deleted range.
   *
   * @param change - Range, text and kind of the change.
   * @param delimiter - Text that ends the template code around the change.
   * @returns The text to write, or why it cannot be written.
   */
  function fitChange(
    change: Change,
    delimiter: NonNullable<TemplateExpression['delimiter']>,
  ): ReturnType<typeof fitTemplateText> {
    if (change.kind !== 'element' && change.kind !== 'property') {
      return fitTemplateText(change.text, delimiter, lang)
    }
    let joint =
      parsed.text.slice(change.start - 1, change.start) +
      parsed.text.slice(change.end, change.end + 1)
    let fit = fitTemplateText(joint, delimiter, lang)
    return fit.kind === 'fit' ? { text: change.text, kind: 'fit' } : fit
  }
  /**
   * Turns one replacement of a visit into a candidate, or into a skipped
   * replacement when it is not accepted; in a template, a replacement of a host
   * or of anything but an expression is dropped without a trace.
   *
   * @param registered - Mutator whose visitor returned the replacement.
   * @param node - Visited node, which a mutator error is reported at.
   * @param replacement - Replacement the visitor returned.
   */
  function addReplacement(
    registered: ActiveMutator,
    node: Node,
    replacement: Replacement,
  ): void {
    let removal = findListRemoval(tree, replacement, svelteTemplate)
    let target = removal?.list ?? replacement.node
    if (
      hosts !== null &&
      (hosts.has(target) || getReplacementKind(target) !== 'expression')
    ) {
      return
    }
    let copied =
      removal !== null && !removal.narrow && removal.copies > MAX_LITERAL_COPIES
    if (copied && removal !== null) {
      removal = { ...removal, narrow: true }
    }
    let change = readChange(registered, replacement, removal)
    if (replacement.skip) {
      skip(
        registered,
        change,
        isTimerDelay(target, change.text) ? TIMER_DELAY_SKIP : replacement.skip,
      )
      return
    }
    let empty =
      removal === null &&
      replacement.text === '' &&
      change.kind === 'expression'
    let violation =
      empty ?
        `returned an empty text for a ${target.type} node; only an element of an array literal or a member of an object literal is removed with an empty text.`
      : validateReplacement(tree, target, change.focus)
    if (violation !== null) {
      diagnostics.push(
        createMutatorError(
          parsed,
          node,
          `Mutator "${registered.id}" ${violation}`,
        ),
      )
      skip(registered, empty ? { ...change, text: '' } : change, {
        reason: `the mutator ${violation.slice(0, -1)}`,
        rule: 'invalid-target',
      })
      return
    }
    let { start, end } = target
    let pin = pins.find(
      entry =>
        start <= entry.start &&
        entry.end <= end &&
        entry.region.start <= start &&
        end <= entry.region.end,
    )
    if (pin) {
      skip(registered, change, {
        rule: 'compiler-macro',
        reason: pin.reason,
      })
      return
    }
    let delimiter = input.expressions?.findLast(
      expression => expression.start <= start,
    )?.delimiter
    let fit =
      delimiter === undefined ?
        { kind: 'fit' as const, text: change.text }
      : fitChange(change, delimiter)
    if (fit.kind === 'unfit') {
      skip(registered, change, {
        rule: 'template-text',
        reason: fit.reason,
      })
      return
    }
    if (isTimerDelay(target, change.text)) {
      skip(registered, change, TIMER_DELAY_SKIP)
      return
    }
    if (
      !services.settings.timeouts &&
      registered.id !== 'optional-chaining' &&
      services.syntax.isLoopAdvanceValue(target)
    ) {
      skip(registered, change, {
        reason:
          'it changes the value that advances a loop, so it may keep the loop running forever',
        rule: 'loop-advance',
      })
      return
    }
    if (copied) {
      skip(registered, change, {
        reason: `removing it takes a copy of the whole literal, which Mootant does not make for a literal with more than ${MAX_LITERAL_COPIES} such ${change.kind === 'element' ? 'elements' : 'members'}`,
        rule: 'literal-copies',
      })
      return
    }
    let host: MutantHost =
      change.kind === 'element' || change.kind === 'property' ?
        { focus: change.focus, kind: change.kind, list: change.list }
      : { kind: change.kind!, ...pickFocus(change) }
    let site = getMutantSite({ ...host, start: change.start })
    candidates.push({
      ignoreRule: findIgnoreRule(rules, {
        line: getSourcePosition(parsed.lineStarts, site).line,
        mutator: registered.id,
        start: site,
      }),
      scope: hosts === null ? getScopePath(tree, target) : TEMPLATE_SCOPE,
      solitary: getSolitaryRanges(replacement.solitary),
      emission: candidates.length,
      start: change.start,
      end: change.end,
      text: fit.text,
      registered,
      ...host,
    })
  }
  let pins = findCompilerPins(tree, parsed.file)
  let hosts = input.hosts ?? null
  let svelteTemplate =
    hosts !== null && getComponentFramework(parsed.file) === 'svelte'
  let table = createVisitorTable(input, diagnostics)

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
        addReplacement(registered, node, replacement)
      }
    }
  }

  return { diagnostics, candidates, skipped }
}

/**
 * Creates the visitors of every mutator, in rank order, and files them by node
 * type. A mutator whose `create` throws gets a mutator error without a position
 * and registers no visitor.
 *
 * @param input - Active mutators, parsed file and shared context services.
 * @param diagnostics - Mutator errors of the file; a throwing `create` adds
 *   one.
 * @returns Visitors by node type, in mutator order.
 */
function createVisitorTable(
  input: Pick<CollectInput, 'mutators' | 'services' | 'parsed'>,
  diagnostics: Diagnostic[],
): Map<string, VisitorEntry[]> {
  let { services, mutators, parsed } = input
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
  return table
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
