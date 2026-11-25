import { stripVTControlCharacters } from 'node:util'
import { getCollection } from 'astro:content'

import type { MdxRenderer } from './mdx-to-markdown'

import { REPORT_PREVIEW, PRESET_STATS } from '../data/guide'
import { BRAND_TYPEFACES } from '../data/brand-typefaces'
import { getProbeResult } from './get-probe-result'
import { BRAND_COLORS } from '../data/brand-colors'
import { toInlineCode } from './to-inline-code'
import { toCodeBlock } from './to-code-block'
import { toTable } from './to-table'

/**
 * Totals that the Markdown of the discount probe shows: the boundary of the
 * mutant and a total on each side of it.
 */
const PROBE_TOTALS = [99, 100, 101]

/**
 * Markdown of the components and HTML tags that the MDX pages of the docs use.
 * A decorative component, such as the intro of the branding page, gives no
 * Markdown.
 */
export let mdxRenderers: Record<string, MdxRenderer | undefined> = {
  MutatorCards: async () => {
    let mutators = (await getCollection('mutators')).toSorted(
      ({ data: { title: a } }, { data: { title: b } }) => a.localeCompare(b),
    )
    return mutators
      .map(
        ({ data: { shortDescription, example, title }, id }) =>
          `- [${title}](/mutators/${id}): ${shortDescription} ${toInlineCode(example.before)} → ${toInlineCode(example.after)}`,
      )
      .join('\n')
  },
  DiscountProbe: () =>
    `Results of ${toInlineCode('getDiscount(total, false)')}:\n\n${toTable(
      [
        'Total',
        toInlineCode('total >= 100'),
        toInlineCode('total > 100'),
        'Mutant',
      ],
      PROBE_TOTALS.map(total => {
        let { original, mutant, killed } = getProbeResult(total)
        return [String(total), original, mutant, killed ? 'killed' : 'survived']
      }),
    )}`,
  PresetStats: () =>
    toTable(
      ['Preset', 'Mutants of the [sample shop](/report/demo#/)', 'Command'],
      PRESET_STATS.map(({ command, mutants, name }) => [
        toInlineCode(name),
        String(mutants),
        toInlineCode(command),
      ]),
    ),
  BrandPalette: () =>
    toTable(
      ['Color', 'Role', 'HEX', 'OKLCH'],
      BRAND_COLORS.map(({ description, oklch, name, hex }) => [
        name,
        description,
        toInlineCode(hex),
        toInlineCode(oklch),
      ]),
    ),
  BrandLogos: ({ props: { kind } }) =>
    ['light', 'dark']
      .map(
        theme =>
          `- [Mootant ${kind} for ${theme} backgrounds](/branding/${kind}-${theme}.svg)`,
      )
      .join('\n'),
  BrandTypography: () =>
    BRAND_TYPEFACES.map(
      ({ weights, role, name, url }) =>
        `- ${role}: [${name}](${url}), ${weights}`,
    ).join('\n'),
  Card: ({ children, props }) =>
    `- [${props['title']}](${props['href']}): ${children.join(' ').replaceAll(/\s+/gu, ' ')}`,
  div: ({ children }) =>
    children.join(
      children.every(child => child.startsWith('- ')) ? '\n' : '\n\n',
    ),
  ReportPreview: () =>
    `[${REPORT_PREVIEW.action}](/report/demo): ${REPORT_PREVIEW.description}`,
  Terminal: ({ props }) =>
    toCodeBlock(stripVTControlCharacters(props['output'] ?? ''), 'text'),
  DemoLink: ({ children, props }) =>
    `[${children.join('')}](/report/demo${props['route']})`,
  Badge: ({ props }) => `- **${props['title']}**: ${props['text']}`,
  kbd: ({ children }) => toInlineCode(children.join('')),
  summary: ({ children }) => `**${children.join('')}**`,
  details: ({ children }) => children.join('\n\n'),
  Cards: ({ children }) => children.join('\n'),
  BrandIntro: () => '',
}
