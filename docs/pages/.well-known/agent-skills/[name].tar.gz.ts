import type { APIRoute } from 'astro'

import { getAgentSkill } from '../../../utils/get-agent-skill'

/**
 * Names the archive of the skill after the skill.
 *
 * @returns Path of the archive.
 */
export async function getStaticPaths(): Promise<
  { params: { name: string } }[]
> {
  let { name } = await getAgentSkill()
  return [{ params: { name } }]
}

/**
 * Answers with the archive of the skill that the discovery index lists.
 *
 * @returns Response with the archive.
 */
export const GET: APIRoute = async () => {
  let { archive } = await getAgentSkill()
  return new Response(archive, {
    headers: { 'content-type': 'application/gzip' },
  })
}
