/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly REPO_OWNER: string;
  readonly REPO_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}