/// <reference types="vite/client" />

// Public app env vars must be prefixed VITE_* — Vite inlines them at
// build time. Add per-var typing here so consumers get checked access.
interface ImportMetaEnv {
  /**
   * Base URL of the deployed feedback worker (no trailing slash).
   * Empty / unset → app falls back to a mailto: link.
   */
  readonly VITE_FEEDBACK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
