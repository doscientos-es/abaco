import { beforeEach, describe, expect, it, vi } from 'vitest'

import { acceptEstimateManually, publishEstimate } from './estimate-publication-actions'
import { recordManualApproval } from './record-manual-approval'

vi.mock('./estimate-publication-actions', () => ({
  publishEstimate: vi.fn(),
  acceptEstimateManually: vi.fn(),
}))

const input = () => ({
  status: 'draft' as const,
  tenantId: 'tenant',
  estimateId: 'estimate',
  operationId: 'operation',
  name: 'María',
  evidence: 'Correo conservado en el expediente',
  onPublished: vi.fn(),
})

beforeEach(() => vi.resetAllMocks())

describe('recordManualApproval', () => {
  it('publica el borrador antes de registrar la aceptación recibida', async () => {
    const values = input()
    await recordManualApproval(values)
    expect(publishEstimate).toHaveBeenCalledWith('tenant', 'estimate')
    expect(acceptEstimateManually).toHaveBeenCalledWith(
      'tenant',
      'estimate',
      'operation',
      'María',
      values.evidence,
    )
    expect(vi.mocked(publishEstimate).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(acceptEstimateManually).mock.invocationCallOrder[0]!,
    )
    expect(values.onPublished).toHaveBeenCalledOnce()
  })

  it('no vuelve a publicar una versión enviada', async () => {
    const values = { ...input(), status: 'sent' as const }
    await recordManualApproval(values)
    expect(publishEstimate).not.toHaveBeenCalled()
    expect(values.onPublished).not.toHaveBeenCalled()
    expect(acceptEstimateManually).toHaveBeenCalledOnce()
  })

  it('no registra la aceptación si falla la publicación', async () => {
    vi.mocked(publishEstimate).mockRejectedValue(new Error('guardado pendiente'))
    const values = input()
    await expect(recordManualApproval(values)).rejects.toThrow('guardado pendiente')
    expect(acceptEstimateManually).not.toHaveBeenCalled()
    expect(values.onPublished).not.toHaveBeenCalled()
  })

  it('indica que se publicó cuando falla el registro posterior', async () => {
    vi.mocked(acceptEstimateManually).mockRejectedValue(new Error('sin permiso'))
    const values = input()
    await expect(recordManualApproval(values)).rejects.toThrow('sin permiso')
    expect(values.onPublished).toHaveBeenCalledOnce()
  })
})
