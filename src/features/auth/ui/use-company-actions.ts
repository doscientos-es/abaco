import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import { resetStore } from '@/shared/store/store'

import { sessionQuery, type ActionResult } from '../application/auth-actions'
import { chooseCompany, createCompany } from '../application/company-actions'

/** Switching or creating a company: refresh the session, then let the root route reload the data. */
export function useCompanyActions() {
  const queryClient = useQueryClient()
  const router = useRouter()

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    await router.invalidate()
  }

  return {
    switchTo: async (id: string): Promise<void> => {
      await chooseCompany(id)
      await refresh()
    },
    create: async (name: string): Promise<ActionResult> => {
      const result = await createCompany(name)
      if (result.ok) {
        // The new company is not in the loaded data yet.
        resetStore()
        await refresh()
      }
      return result
    },
  }
}
