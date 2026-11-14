import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://ibrahimhasaan.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: { syntaxHighlight: false },
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  integrations: [mdx()],
});
