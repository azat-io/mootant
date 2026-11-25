import type { APIRoute } from 'astro'

import { createHash } from 'node:crypto'

import { getAgentSkill } from '../../../utils/get-agent-skill'

/**
 * Index of agent skill discovery, version 0.2.0: the skill of Mootant as an
 * archive with its SHA-256 digest. `npx skills add https://mootant.org` reads
 * it.
 *
 * @returns Response with the index.
 */
export const GET: APIRoute = async () => {
  let { description, archive, name } = await getAgentSkill()
  return Response.json({
    skills: [
      {
        digest: `sha256:${createHash('sha256').update(archive).digest('hex')}`,
        url: `/.well-known/agent-skills/${name}.tar.gz`,
        type: 'archive',
        description,
        name,
      },
    ],
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
  })
}
