import { beforeEach, expect, it, vi } from 'vitest'

import { useCompanyActions } from './use-company-actions'

const { chooseCompany, invalidateQueries, invalidate } = vi.hoisted(() => ({
  chooseCompany: vi.fn(),
  invalidateQueries: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate }) }))
vi.mock('@/shared/store/store', () => ({ resetStore: vi.fn() }))
vi.mock('../application/auth-actions', () => ({ sessionQuery: { queryKey: ['auth', 'session'] } }))
vi.mock('../application/company-actions', () => ({ chooseCompany, createCompany: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

it('saves the company and refreshes the session and router', async () => {
  await useCompanyActions().switchTo('company-2')
  expect(chooseCompany).toHaveBeenCalledWith('company-2')
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['auth', 'session'] })
  expect(invalidate).toHaveBeenCalledOnce()
})

it('does not refresh after saving fails', async () => {
  chooseCompany.mockRejectedValue(new Error('Unavailable'))
  await expect(useCompanyActions().switchTo('company-2')).rejects.toThrow('Unavailable')
  expect(invalidateQueries).not.toHaveBeenCalled()
  expect(invalidate).not.toHaveBeenCalled()
})
