import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { collections as registry, statuses, type CollectionDef } from './catalogue';

const schemaFor = (c: CollectionDef) =>
  z
    .object({
      title: z.string(),
      date: z.coerce.date(),
      kind: z.string(),
      summary: z.string(),
      status: z.enum(statuses).optional(),
      links: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
      custom: z.boolean().optional(),
      // the item opens this address instead of its own page (an app with its own layout)
      app: z.string().regex(/^(\/|https:\/\/)/, 'app should start with / or https://').optional(),
      draft: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.app && data.custom) {
        ctx.addIssue({ code: 'custom', path: ['app'], message: 'Use either app or custom: true, not both.' });
      }
      if (!c.kinds.includes(data.kind)) {
        ctx.addIssue({
          code: 'custom',
          path: ['kind'],
          message: `Unknown kind "${data.kind}" in ${c.name}. Allowed: ${c.kinds.join(', ')}.`,
        });
      }
    });

// The id is the file name (w-04); it must be "<letter>-<2+ digits>" and the letter must match the folder.
const loaderFor = (c: CollectionDef) =>
  glob({
    base: `./src/content/${c.letter.toLowerCase()}`,
    pattern: '*.{md,mdx}',
    generateId: ({ entry }) => {
      const id = entry.replace(/\.(md|mdx)$/, '');
      const m = /^([a-z])-\d{2,}$/.exec(id);
      if (!m) {
        throw new Error(
          `Bad file name "${entry}" in src/content/${c.letter.toLowerCase()}/. Use "${c.letter.toLowerCase()}-" plus two or more digits, e.g. ${c.letter.toLowerCase()}-04.md.`,
        );
      }
      if (m[1] !== c.letter.toLowerCase()) {
        throw new Error(
          `"${entry}" is in the ${c.name} folder (src/content/${c.letter.toLowerCase()}/) but starts with "${m[1]}". Move it to src/content/${m[1]}/ or rename it.`,
        );
      }
      return id;
    },
  });

export const collections = Object.fromEntries(
  registry.map((c) => [c.letter.toLowerCase(), defineCollection({ loader: loaderFor(c), schema: schemaFor(c) })]),
);

