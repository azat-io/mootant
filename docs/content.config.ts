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

let mutators = defineCollection({
  schema: z.object({
    example: z.object({
      before: z.string(),
      after: z.string(),
    }),
    keywords: z.array(z.string()).optional(),
    shortDescription: z.string(),
    description: z.string(),
    title: z.string(),
  }),
  loader: glob({
    base: path.join(import.meta.dirname, 'content', 'mutators'),
    pattern: '**/*.md',
  }),
})

export let collections = {
  mutators,
  guide,
}
