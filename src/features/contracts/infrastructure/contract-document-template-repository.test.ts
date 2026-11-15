import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

import {
  applyContractDocumentTemplate,
  loadContractDocumentTemplate,
  saveContractDocumentTemplate,
} from './contract-document-template-repository'

const sections = {
  before: [{ id: 'intro', title: 'Objeto', content: 'Contenido', pageBreakBefore: true }],
  after: [],
}

describe('persistencia de plantillas de contrato', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    })
  })

  it('devuelve una plantilla vacía para una empresa sin configuración', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(loadContractDocumentTemplate('tenant')).resolves.toEqual({
      sections: { before: [], after: [] },
      revision: 0,
    })
  })

  it('guarda la revisión esperada y el contenido completo', async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null })
    await expect(saveContractDocumentTemplate('tenant', { sections, revision: 2 })).resolves.toBe(3)
    expect(mocks.rpc).toHaveBeenCalledWith('save_contract_document_template', {
      p_tenant_id: 'tenant',
      p_expected_revision: 2,
      p_sections: sections,
    })
  })

  it('rechaza secciones con identificadores repetidos antes de guardar', async () => {
    await expect(
      saveContractDocumentTemplate('tenant', {
        sections: { before: sections.before, after: sections.before },
        revision: 0,
      }),
    ).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('aplica la plantilla usando la versión del contrato y propaga conflictos', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'Contrato modificado' } })
    await expect(
      applyContractDocumentTemplate({
        tenantId: 'tenant',
        contractId: 'contract',
        expectedUpdatedAt: 'version',
        operationId: 'operation',
      }),
    ).rejects.toThrow('Contrato modificado')
    expect(mocks.rpc).toHaveBeenCalledWith('apply_contract_document_template', {
      p_tenant_id: 'tenant',
      p_contract_id: 'contract',
      p_expected_updated_at: 'version',
      p_operation_id: 'operation',
    })
  })
})
