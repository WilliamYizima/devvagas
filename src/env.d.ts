/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly REPO_OWNER: string;
  readonly REPO_NAME: string;
  readonly ENABLE_AJUDA?: string;
  PROD: boolean;
  DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}