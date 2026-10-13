import { createFileRoute } from '@tanstack/react-router'

import { ConfirmPage } from '@/features/auth'

export const Route = createFileRoute('/confirmar')({
  validateSearch: (search: Record<string, unknown>): { token_hash?: string; type?: string } => ({
    ...(typeof search.token_hash === 'string' ? { token_hash: search.token_hash } : {}),
    ...(typeof search.type === 'string' ? { type: search.type } : {}),
  }),
  component: function Confirmar() {
    const { token_hash, type } = Route.useSearch()
    return <ConfirmPage tokenHash={token_hash} type={type} />
  },
})
