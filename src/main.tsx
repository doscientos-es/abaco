import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { PwaRuntime } from '@/app/pwa/pwa-runtime'
import { queryClient, router } from '@/app/router'
import { sessionQuery } from '@/features/auth'
import { clearVisitReportLocalDrafts } from '@/features/visits/application/visit-report-local-draft'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { resetStore, setRepository } from '@/shared/store/store'
import { createSupabaseRepository } from '@/shared/store/supabase-repository'

import './styles.css'

// Keeps the cached session in sync (sign-out in another tab, token refresh, password change).
const supabase = createBrowserSupabaseClient()
// All data is read and written through Supabase.
setRepository(createSupabaseRepository(supabase))
let activeUserId: string | undefined
supabase.auth.onAuthStateChange((event, session) => {
  const nextUserId = session?.user.id
  const replacedAccount = Boolean(activeUserId && nextUserId && activeUserId !== nextUserId)
  activeUserId = nextUserId
  if (event === 'INITIAL_SESSION') return
  // Deferred: awaiting Supabase calls inside this callback can deadlock the auth client.
  setTimeout(() => {
    if (event === 'SIGNED_OUT' || replacedAccount) {
      clearVisitReportLocalDrafts()
      queryClient.clear()
      resetStore()
    } else void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    void router.invalidate()
  }, 0)
})

const rootElement = document.getElementById('root')

if (!rootElement) throw new Error('No se ha encontrado el elemento raíz de la aplicación.')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PwaRuntime />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
