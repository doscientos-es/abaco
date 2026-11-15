import { beforeEach, expect, it, vi } from 'vitest'

import { applyLibraryTemplate, saveLibraryTemplate } from './contract-template-library-repository'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ rpc: mocks.rpc }),
}))

beforeEach(() => {
  mocks.rpc.mockReset()
})

it('aplica la versión seleccionada con el control de concurrencia y la clave de operación', async () => {
  mocks.rpc.mockResolvedValueOnce({ error: null })
  await applyLibraryTemplate({
    tenantId: 'tenant',
    contractId: 'contract',
    templateId: 'template',
    templateRevision: 3,
    expectedUpdatedAt: 'version',
    operationId: 'operation',
  })
  expect(mocks.rpc).toHaveBeenCalledWith('apply_contract_library_template', {
    p_tenant_id: 'tenant',
    p_contract_id: 'contract',
    p_template_id: 'template',
    p_template_revision: 3,
    p_expected_updated_at: 'version',
    p_operation_id: 'operation',
  })
})

it('propaga los conflictos al guardar una plantilla', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'La plantilla ha cambiado' } })
  await expect(
    saveLibraryTemplate('tenant', {
      id: 'id',
      name: 'Nombre',
      before_ids: [],
      after_ids: [],
      revision: 2,
    }),
  ).rejects.toThrow('La plantilla ha cambiado')
})
