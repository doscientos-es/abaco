/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_MENOSLIOS_ONBOARDING_BOOKING_URL?: string
  readonly VITE_ABACO_ONBOARDING_BOOKING_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
