/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Referral GPS backend API. Defaults to "/api" (dev proxy). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
