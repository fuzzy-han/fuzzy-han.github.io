// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://fuzzy-han.github.io',
  base: '/',
  output: 'static',
  build: {
    format: 'directory',
  },
});
