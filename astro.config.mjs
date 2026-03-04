import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  base: process.env.REPO_NAME ? `/${process.env.REPO_NAME}` : '/',
});
