import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://williamyizima.github.io',
  base: process.env.REPO_NAME ? `/${process.env.REPO_NAME}/` : '/',
});
