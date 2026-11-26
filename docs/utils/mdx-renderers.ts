import { stripVTControlCharacters } from 'node:util'
import { getCollection } from 'astro:content'

import type { MdxRenderer } from './mdx-to-markdown'

import { REPORT_PREVIEW, PRESET_STATS } from '../data/guide'
import { SKILL_REPORT, AGENTS } from '../data/agent-skill'
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
  SkillReport: () =>
    [
      `${SKILL_REPORT.label} of ${toInlineCode(SKILL_REPORT.scope)}: ${SKILL_REPORT.score.after}%, from ${SKILL_REPORT.score.before}%. ${SKILL_REPORT.tests}.`,
      SKILL_REPORT.counts
        .map(({ label, value, note }) => `- ${label}: ${value}, ${note}`)
        .join('\n'),
      `${SKILL_REPORT.decisionsLabel}:`,
      SKILL_REPORT.decisions
        .map(({ title, kind, text }) => `- ${kind}: ${title}. ${text}`)
        .join('\n'),
    ].join('\n\n'),
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
  Card: ({ children, props }) =>
    `- ${props['href'] ? `[${props['title']}](${props['href']})` : `**${props['title']}**`}: ${children.join(' ').replaceAll(/\s+/gu, ' ')}`,
  BrandTypography: () =>
    BRAND_TYPEFACES.map(
      ({ weights, role, name, url }) =>
        `- ${role}: [${name}](${url}), ${weights}`,
    ).join('\n'),
  AgentBadges: () =>
    `${AGENTS.label}: ${AGENTS.list.map(({ title }) => title).join(', ')} [${AGENTS.more.text}](${AGENTS.more.url}).`,
  div: ({ children }) =>
    children.join(
      children.every(child => child.startsWith('- ')) ? '\n' : '\n\n',
    ),
  Step: ({ children, props }) =>
    `**${props['title']}**: ${children.join(' ').replaceAll(/\s+/gu, ' ')}`,
  ReportPreview: () =>
    `[${REPORT_PREVIEW.action}](/report/demo): ${REPORT_PREVIEW.description}`,
  Terminal: ({ props }) =>
    toCodeBlock(stripVTControlCharacters(props['output'] ?? ''), 'text'),
  Steps: ({ children }) =>
    children.map((child, index) => `${index + 1}. ${child}`).join('\n'),
  DemoLink: ({ children, props }) =>
    `[${children.join('')}](/report/demo${props['route']})`,
  Badge: ({ props }) => `- **${props['title']}**: ${props['text']}`,
  kbd: ({ children }) => toInlineCode(children.join('')),
  summary: ({ children }) => `**${children.join('')}**`,
  details: ({ children }) => children.join('\n\n'),
  Cards: ({ children }) => children.join('\n'),
  BrandIntro: () => '',
}
