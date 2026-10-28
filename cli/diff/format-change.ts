import type { ChangedPart } from './narrow-change'

import {
  getGraphemeWidth,
  getDisplayWidth,
  splitGraphemes,
} from '../terminal/get-display-width'
import { cutToWidth } from '../terminal/cut-to-width'
import { narrowChange } from './narrow-change'
import { isJoined } from './is-joined'

/**
 * Most columns of one side of a change, however wide the line is.
 */
const MAX_SIDE_WIDTH = 60

/**
 * Fewest columns left to each side of a change cut to fit a line.
 */
const MIN_SIDE_WIDTH = 8

/**
 * Most shared graphemes shown on each side of a changed text.
 */
const MAX_CONTEXT_LENGTH = 20

/**
 * Shared graphemes a side of a change must have before the shared text around
 * it may be cut inside a word: a side with fewer, such as only the `'` of
 * `'CallExpression'`, takes as many more characters as fit.
 */
const MIN_TOKEN_CONTEXT = 2

/**
 * Word characters the shared text around a removal must show before the removed
 * text is shown whole: with fewer, such as only the `)` of `f(a) || b -> f(a)`,
 * the removed text is cut instead.
 */
const MIN_REMOVAL_CONTEXT = 3

/**
 * Widest shared start kept whole before a changed text too wide to show whole;
 * a narrow side keeps less, at most half its room. A wider shared start keeps
 * only its last characters, half as many.
 */
const MAX_LEAD_WIDTH = 20

/**
 * Name of a side without text.
 */
const EMPTY = '(empty)'

/**
 * How a change is printed.
 */
interface ChangeOptions {
  /**
   * Most columns of the whole change; unlimited by default.
   */
  maxLength?: number

  /**
   * Mark of a cut; `...` by default.
   */
  ellipsis?: string

  /**
   * Mark between the sides; `->` by default.
   */
  arrow?: string
}

/**
 * Formats the change of a mutant or skipped candidate as `original ->
 * replacement` on one line, runs of whitespace as one space. A side keeps at
 * most 60 columns and the whole change the room it has. When a change does not
 * fit, the text both sides share at their start and end is cut first, so what
 * changed, widened to whole words and operators, stays in view with as many
 * whole words of shared text around it as fit, up to 20 characters on each
 * side, such as `…(token)?.value -> …(token).value`, or as many characters as
 * fit when not even two whole fit; when even the changed text does not fit,
 * both sides start at most a few characters before it and are cut at their end,
 * each keeping at least a few columns. An empty side is named `(empty)`.
 *
 * @param entry - Original and replacement texts.
 * @param options - Arrow, ellipsis and room of the change.
 * @returns The change on one line.
 */
export function formatChange(
  entry: { replacement: string; original: string },
  options: ChangeOptions = {},
): string {
  let { maxLength = Infinity, ellipsis = '...', arrow = '->' } = options
  let original = collapse(entry.original)
  let replacement = collapse(entry.replacement)
  let separator = ` ${arrow} `
  let room = maxLength - getDisplayWidth(separator)
  let sides: [string, string]
  if (original === '' || replacement === '') {
    let other = original === '' ? replacement : original
    let cut = cutToWidth(other === '' ? EMPTY : other, {
      width: Math.min(
        MAX_SIDE_WIDTH,
        Math.max(MIN_SIDE_WIDTH, room - getDisplayWidth(EMPTY)),
      ),
      ellipsis,
    })
    sides = original === '' ? [EMPTY, cut] : [cut, EMPTY]
  } else {
    sides = windowChange(
      splitGraphemes(original),
      splitGraphemes(replacement),
      { ellipsis, room },
    )
  }
  return sides.join(separator)
}

/**
 * Shows the two sides of a change within the room: whole when they fit, else
 * the changed text with as much of the shared text around it as fits, else the
 * changed text cut at its end.
 *
 * @param original - Graphemes of the original.
 * @param replacement - Graphemes of the replacement.
 * @param limits - Room of both sides together and the mark of a cut.
 * @param limits.ellipsis - Mark of a cut.
 * @param limits.room - Most columns of both sides together.
 * @returns Original and replacement as printed.
 */
function windowChange(
  original: string[],
  replacement: string[],
  limits: { ellipsis: string; room: number },
): [string, string] {
  let { ellipsis, room } = limits
  let part = narrowChange(original, replacement)
  let prefix = part.start
  let suffix = original.length - part.originalEnd
  let shared = {
    after: original.slice(original.length - suffix),
    before: original.slice(0, prefix),
  }

  /**
   * Prints one side with the given shared text around its changed text.
   *
   * @param side - Graphemes of the side.
   * @param before - Shared graphemes kept before the change.
   * @param after - Shared graphemes kept after the change.
   * @returns The side as printed.
   */
  function render(side: string[], before: number, after: number): string {
    return [
      before < prefix ? ellipsis : '',
      ...shared.before.slice(prefix - before),
      ...side.slice(prefix, side.length - suffix),
      ...shared.after.slice(0, after),
      after < suffix ? ellipsis : '',
    ].join('')
  }

  /**
   * Tells whether both sides fit with the given shared text.
   *
   * @param before - Shared graphemes kept before the change.
   * @param after - Shared graphemes kept after the change.
   * @returns True when both sides fit their limits.
   */
  function fits(before: number, after: number): boolean {
    let left = getDisplayWidth(render(original, before, after))
    let right = getDisplayWidth(render(replacement, before, after))
    return (
      left <= MAX_SIDE_WIDTH && right <= MAX_SIDE_WIDTH && left + right <= room
    )
  }

  if (fits(prefix, suffix)) {
    return [original.join(''), replacement.join('')]
  }
  let removal =
    part.originalEnd === part.start || part.replacementEnd === part.start
  if (fits(0, 0)) {
    let { before, after } = growContext(shared, fits)
    let context = [
      ...shared.before.slice(prefix - before),
      ...shared.after.slice(0, after),
    ]
    if (
      !removal ||
      context.filter(isWordGrapheme).length >= MIN_REMOVAL_CONTEXT
    ) {
      return [
        render(original, before, after),
        render(replacement, before, after),
      ]
    }
  }
  return cutChange({ replacement, original, removal, part }, limits)
}

/**
 * Shows the two sides of a change cut at their end, for a changed text too wide
 * to show whole or a removal that would show too few word characters around it:
 * both sides start at most a few characters before the changed text, a removal
 * keeping a word, and each keeps at least `MIN_SIDE_WIDTH` columns.
 *
 * @param change - Both sides and where they differ.
 * @param change.replacement - Graphemes of the replacement.
 * @param change.original - Graphemes of the original.
 * @param change.part - Changed part of the two sides.
 * @param change.removal - Whether one side has no changed text.
 * @param limits - Room of both sides together and the mark of a cut.
 * @param limits.ellipsis - Mark of a cut.
 * @param limits.room - Most columns of both sides together.
 * @returns Original and replacement as printed.
 */
function cutChange(
  change: {
    replacement: string[]
    original: string[]
    part: ChangedPart
    removal: boolean
  },
  limits: { ellipsis: string; room: number },
): [string, string] {
  let { replacement, original, removal, part } = change
  let { ellipsis, room } = limits
  let prefix = part.start
  let sharedBefore = original.slice(0, prefix)
  let total = Math.min(room, MAX_SIDE_WIDTH * 2)
  let half = Math.max(MIN_SIDE_WIDTH, Math.floor(total / 2))
  let leadWidth = Math.min(MAX_LEAD_WIDTH, Math.floor(half / 2))
  let keep = prefix
  if (getDisplayWidth(sharedBefore.join('')) > leadWidth) {
    keep = keepLead(sharedBefore.toReversed(), {
      width: removal ? leadWidth : Math.floor(leadWidth / 2),
      removal,
    })
  }
  let lead = keep < prefix ? ellipsis : ''
  let sides = [original, replacement].map(
    side => `${lead}${side.slice(prefix - keep).join('')}`,
  )
  let short = removal && part.originalEnd === part.start ? 0 : 1
  let longCut = cutToWidth(sides[1 - short]!, {
    width: Math.min(
      MAX_SIDE_WIDTH,
      Math.max(
        half,
        total -
          Math.min(
            getDisplayWidth(sides[short]!),
            removal ? Math.max(MIN_SIDE_WIDTH, Math.floor(total / 3)) : half,
          ),
      ),
    ),
    ellipsis,
  })
  let shortCut = cutToWidth(sides[short]!, {
    width: Math.min(
      MAX_SIDE_WIDTH,
      Math.max(MIN_SIDE_WIDTH, total - getDisplayWidth(longCut)),
    ),
    ellipsis,
  })
  return short === 1 ? [longCut, shortCut] : [shortCut, longCut]
}

/**
 * Counts the shared graphemes kept around a changed text that fits: whole
 * tokens on each side in turn while both sides fit, up to `MAX_CONTEXT_LENGTH`
 * graphemes on each side, then single graphemes on a side that kept fewer than
 * `MIN_TOKEN_CONTEXT`.
 *
 * @param shared - Shared graphemes around the change.
 * @param shared.before - Shared graphemes before the change.
 * @param shared.after - Shared graphemes after the change.
 * @param fits - Tells whether both sides fit with the given shared graphemes
 *   kept before and after the change.
 * @returns Shared graphemes kept before and after the change.
 */
function growContext(
  shared: { before: string[]; after: string[] },
  fits: (before: number, after: number) => boolean,
): { before: number; after: number } {
  let prefix = shared.before.length
  let suffix = shared.after.length
  let before = 0
  let after = 0
  let grew = true
  while (grew) {
    grew = false
    let longer = before + getTokenLength(shared.before.toReversed(), before)
    if (longer <= Math.min(prefix, MAX_CONTEXT_LENGTH) && fits(longer, after)) {
      before = longer
      grew = true
    }
    longer = after + getTokenLength(shared.after, after)
    if (
      longer <= Math.min(suffix, MAX_CONTEXT_LENGTH) &&
      fits(before, longer)
    ) {
      after = longer
      grew = true
    }
  }
  let fillBefore = before < MIN_TOKEN_CONTEXT
  let fillAfter = after < MIN_TOKEN_CONTEXT
  grew = true
  while (grew) {
    grew = false
    if (
      fillBefore &&
      before < Math.min(prefix, MAX_CONTEXT_LENGTH) &&
      fits(before + 1, after)
    ) {
      before++
      grew = true
    }
    if (
      fillAfter &&
      after < Math.min(suffix, MAX_CONTEXT_LENGTH) &&
      fits(before, after + 1)
    ) {
      after++
      grew = true
    }
  }
  return { before, after }
}

/**
 * Counts the shared graphemes kept before a changed text too wide to show
 * whole: as many whole tokens as fit the width. When one side has no changed
 * text, so that it would show nothing of its own, it keeps at least a word, cut
 * at its start when the width is too narrow for it.
 *
 * @param reversed - Shared graphemes before the change, last first.
 * @param limits - Most columns to keep and whether a side has no change.
 * @param limits.width - Most columns of the kept graphemes.
 * @param limits.removal - Whether one side has no changed text.
 * @returns Graphemes to keep.
 */
function keepLead(
  reversed: readonly string[],
  limits: { removal: boolean; width: number },
): number {
  let keep = 0
  let longer = getTokenLength(reversed, 0)
  while (
    longer <= reversed.length &&
    getDisplayWidth(reversed.slice(0, longer).join('')) <= limits.width
  ) {
    keep = longer
    longer += getTokenLength(reversed, longer)
  }
  if (!limits.removal || reversed.slice(0, keep).some(isWordGrapheme)) {
    return keep
  }
  let word = reversed.findIndex(isWordGrapheme)
  if (word === -1) {
    return keep
  }
  let fit = word + 1
  let width = getDisplayWidth(reversed.slice(0, fit).join(''))
  while (
    fit < reversed.length &&
    isJoined(reversed[fit]!, reversed[fit - 1]!) &&
    width + getGraphemeWidth(reversed[fit]!) <= limits.width
  ) {
    width += getGraphemeWidth(reversed[fit]!)
    fit++
  }
  return fit
}

/**
 * Counts the graphemes of the token that starts at an index: a word, an
 * operator, or one other character.
 *
 * @param graphemes - Graphemes to read.
 * @param index - Index of the first grapheme of the token.
 * @returns Graphemes of the token; 1 past the end.
 */
function getTokenLength(graphemes: readonly string[], index: number): number {
  let end = index + 1
  while (
    end < graphemes.length &&
    isJoined(graphemes[end - 1]!, graphemes[end]!)
  ) {
    end++
  }
  return end - index
}

/**
 * Puts a source fragment on one line: runs of whitespace become one space.
 *
 * @param text - Original or replacement text of a mutant.
 * @returns The text on one line, trimmed.
 */
function collapse(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim()
}

/**
 * Tells whether a grapheme is a character of a word or number.
 *
 * @param grapheme - Grapheme to check.
 * @returns True for a letter, a digit, `_` or `$`.
 */
function isWordGrapheme(grapheme: string): boolean {
  return isJoined(grapheme, 'a')
}
