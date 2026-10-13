import type { QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'

import { AppFrame } from '@/app/app-frame'
import { PageError, PageNotFound } from '@/shared/ui/page-states'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  errorComponent: PageError,
  notFoundComponent: () => <PageNotFound />,
})

function RootLayout() {
  return (
    <AppFrame>
      <Outlet />
    </AppFrame>
  )
}


