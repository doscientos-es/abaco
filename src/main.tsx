import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { queryClient, router } from '@/app/router'

import { sessionQuery } from '@/features/auth'
import { createBrowserSupabaseClient, isSupabaseConfigured } from '@/shared/lib/supabase/client'

import './styles.css'

// Keeps the cached session in sync (sign-out in another tab, token refresh, password change).
if (isSupabaseConfigured()) {
  const supabase = createBrowserSupabaseClient()
  // Real sessions read and write through Supabase; without it the app keeps its local demo data.
  setRepository(createSupabaseRepository(supabase))
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION') return
    // Deferred: awaiting Supabase calls inside this callback can deadlock the auth client.
    setTimeout(() => {
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        resetStore()
      }
      else void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
      void router.invalidate()
    }, 0)
  })
}

const rootElement = document.getElementById('root')

if (!rootElement) throw new Error('No se ha encontrado el elemento raíz de la aplicación.')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
