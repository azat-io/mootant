import { getCollection } from 'astro:content'

import type { OpenGraphCard } from '../../utils/render-open-graph'

import { frontmatter as agentSkillPage } from '../../content/agent-skill.md'
import { frontmatter as mutatorsPage } from '../../content/mutators.mdx'
import { renderOpenGraph } from '../../utils/render-open-graph'
import { communityPages } from '../../utils/community-pages'

interface Path {
  params: {
    path: undefined | string
  }
  props: OpenGraphCard
}

/**
 * Lists the Open Graph images of the docs, one next to each page: the home page
 * with the title and the slogan of its hero, then the guide, the agent skill
 * page, the page that lists the mutators, the mutators and Community.
 *
 * @returns Path and text of each image.
 */
export async function getStaticPaths(): Promise<Path[]> {
  let guides = await getCollection('guide')
  let mutators = await getCollection('mutators')
  return [
    {
      props: {
        description: 'Mutation testing for JavaScript and TypeScript',
        title: 'Find the tests\nthat test nothing.',
        home: true,
      },
      params: {
        path: undefined,
      },
    },
    ...guides.map(({ data, id }) => ({
      props: {
        description: data.description,
        title: data.title,
        label: 'Guide',
      },
      params: {
        path: `guide/${id}`,
      },
    })),
    {
      props: {
        description: String(agentSkillPage['description']),
        title: String(agentSkillPage['title']),
      },
      params: {
        path: 'agent-skill',
      },
    },
    {
      props: {
        description: String(mutatorsPage['description']),
        title: String(mutatorsPage['title']),
      },
      params: {
        path: 'mutators',
      },
    },
    ...mutators.map(({ data, id }) => ({
      props: {
        description: data.shortDescription,
        title: data.title,
        label: 'Mutators',
      },
      params: {
        path: `mutators/${id}`,
      },
    })),
    ...Object.values(communityPages).map(({ description, title, url }) => ({
      props: { label: 'Community', description, title },
      params: { path: url.slice(1) },
    })),
  ]
}

/**
 * Draws the Open Graph image of a page.
 *
 * @param context - Request context with the text of the image.
 * @param context.props - Text of the image.
 * @returns Response with the PNG image.
 */
export function GET({ props }: Pick<Path, 'props'>): Response {
  return renderOpenGraph(props)
}
