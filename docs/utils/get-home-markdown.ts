import type { MarkdownSection } from './get-markdown-sections'

import {
  COMPATIBILITY,
  HOW_IT_WORKS,
  COVERAGE,
  SKILL,
  HERO,
  WHY,
} from '../data/home'
import { toInlineCode } from './to-inline-code'
import { toCodeBlock } from './to-code-block'
import { toTable } from './to-table'

/**
 * Writes the Markdown of the home page: its sections in their order, then the
 * pages of the docs by sidebar section, which link to their Markdown.
 *
 * @param sections - Sections of the docs with their pages.
 * @returns Markdown of the home page.
 */
export function getHomeMarkdown(sections: MarkdownSection[]): string {
  let { mutation, coverage } = COVERAGE
  let blocks = [
    '# Mootant',
    `> ${HERO.slogan.replaceAll(/\s/gu, ' ')}`,
    `**${HERO.title}** ${HERO.description}`,
    toCodeBlock(HERO.install, 'sh'),
    [
      '- [Get Started](/guide/getting-started.md)',
      '- [View on GitHub](https://github.com/azat-io/mootant)',
    ].join('\n'),
    `## ${COVERAGE.title}`,
    `${COVERAGE.lead.muted} ${COVERAGE.lead.text}`,
    `**${coverage.label}**, ${toInlineCode(coverage.command)}: ${coverage.value}. ${coverage.caption}`,
    toTable(
      ['File', ...coverage.metrics],
      coverage.files.map(file => [
        file,
        ...coverage.metrics.map(() => coverage.value),
      ]),
    ),
    `**${mutation.label}**, ${toInlineCode(mutation.command)}: ${mutation.value} ${mutation.caption}, ${mutation.score}.`,
    `${toInlineCode(`${mutation.file}${mutation.location}`)}:`,
    toCodeBlock(`- ${mutation.before}\n+ ${mutation.after}`, 'diff'),
    mutation.verdict,
    `## ${WHY.title}`,
    `${WHY.lead.muted} ${WHY.lead.text}`,
    ...WHY.cards.map(
      ({ description, title }) => `### ${title}\n\n${description}`,
    ),
    `## ${HOW_IT_WORKS.title}`,
    ...HOW_IT_WORKS.steps.map(
      ({ description, label, title }) =>
        `### ${label}: ${title}\n\n${description}`,
    ),
    `## ${SKILL.title}`,
    ...SKILL.paragraphs,
    toCodeBlock(SKILL.install, 'sh'),
    `## ${COMPATIBILITY.title}`,
    '### File extensions',
    COMPATIBILITY.extensions
      .map(extension => toInlineCode(extension))
      .join(', '),
    '### Test runners',
    COMPATIBILITY.runners
      .map(({ title, text }) => `- ${title}: ${toInlineCode(text)}`)
      .join('\n'),
    `## ${COMPATIBILITY.demo.title}`,
    COMPATIBILITY.demo.description,
    COMPATIBILITY.demo.tip,
    '[View Demo](/report/demo)',
    '## Documentation',
    ...sections.map(
      ({ pages, title }) =>
        `### ${title}\n\n${pages
          .map(page => `- [${page.title}](${page.url}.md): ${page.description}`)
          .join('\n')}`,
    ),
  ]
  return `${blocks.join('\n\n')}\n`
}
