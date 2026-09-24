/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PRODUCT_ID: string;
  readonly VITE_PRODUCT_NAME: string;
  readonly VITE_PRODUCT_DESCRIPTION: string;
  readonly VITE_DEEPSEEK_API_KEY: string;
  readonly VITE_PAYWALL_TITLE: string;
  readonly VITE_PAYWALL_DESCRIPTION: string;
  readonly VITE_ASSISTANT_CONTEXT: string;
  readonly INTEL_SUPABASE_URL?: string;
  readonly INTEL_SUPABASE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
