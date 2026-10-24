import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
import path from 'node:path'

let guide = defineCollection({
  schema: z.object({
    keywords: z.array(z.string()).optional(),
    description: z.string(),
    title: z.string(),
  }),
  loader: glob({
    base: path.join(import.meta.dirname, 'content', 'guide'),
    pattern: '**/*.md',
  }),
})

export let collections = {
  guide,
}
