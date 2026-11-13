import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signedContractBucket, signedContractMaxBytes } from '../domain/contract-signature'
import {
  loadContractAssignmentSetup,
  recordContractSignature,
  signedContractDocumentUrl,
} from './contract-signature-repository'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  rpc: vi.fn(),
  createSignedUrl: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ storage: { from: mocks.from }, rpc: mocks.rpc }),
}))

const input = {
  tenantId: 'tenant-1',
  contractId: 'contract-1',
  expectedUpdatedAt: 'version-1',
  operationId: 'operation-1',
  file: null as File | null,
}
const pdf = () =>
  new File(['%PDF-1.7\nSigned contract'], 'Firmado.pdf', { type: 'application/pdf' })

describe('contract signature persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({ upload: mocks.upload, createSignedUrl: mocks.createSignedUrl })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.rpc.mockResolvedValue({ error: null })
  })

  it('records a signature without uploading or activating the contract', async () => {
    await recordContractSignature(input)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_contract_signature', {
      p_tenant_id: 'tenant-1',
      p_contract_id: 'contract-1',
      p_expected_updated_at: 'version-1',
      p_operation_id: 'operation-1',
      p_document_path: null,
      p_document_name: null,
    })
  })

  it('loads the tenant-scoped accepted tasks and propagates errors', async () => {
    const setup = { jobs: [], tasks: [], assignments: [], updated_at: 'v1' }
    mocks.rpc.mockResolvedValueOnce({ data: setup, error: null })
    expect(await loadContractAssignmentSetup('tenant-1', 'contract-1')).toEqual(setup)
    expect(mocks.rpc).toHaveBeenCalledWith('load_contract_assignment_setup', {
      p_tenant_id: 'tenant-1',
      p_contract_id: 'contract-1',
    })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Sin permiso' } })
    await expect(loadContractAssignmentSetup('other', 'contract-1')).rejects.toThrow('Sin permiso')
  })

  it('sends all assignments in the same signing transaction', async () => {
    const assignments = [
      {
        task_key: 'job:job-1',
        job_id: 'job-1',
        assigned_user_ids: ['person-1'],
        work_team_id: null,
      },
    ]
    await recordContractSignature({ ...input, assignments })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_contract_signature',
      expect.objectContaining({ p_assignments: assignments }),
    )
  })

  it('uploads an immutable PDF before registering its tenant-scoped path', async () => {
    const file = pdf()
    await recordContractSignature({ ...input, file })
    expect(mocks.from).toHaveBeenCalledWith(signedContractBucket)
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(
      'tenant-1/contract-1/operation-1.pdf',
      file,
      {
        upsert: false,
        contentType: 'application/pdf',
      },
    )
    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_contract_signature',
      expect.objectContaining({
        p_document_path: 'tenant-1/contract-1/operation-1.pdf',
        p_document_name: 'Firmado.pdf',
      }),
    )
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it.each([
    new File(['%PDF-1.7'], 'image.png', { type: 'image/png' }),
    new File(['not a PDF'], 'fake.pdf', { type: 'application/pdf' }),
    new File([], 'empty.pdf', { type: 'application/pdf' }),
    new File([new Uint8Array(signedContractMaxBytes + 1)], 'large.pdf', {
      type: 'application/pdf',
    }),
  ])('rejects invalid or oversized PDFs before any upload: $name', async (file) => {
    await expect(recordContractSignature({ ...input, file })).rejects.toThrow(/PDF/)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not record a signature when the upload fails', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'Sin conexión', statusCode: '500' } })
    await expect(recordContractSignature({ ...input, file: pdf() })).rejects.toThrow('Sin conexión')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reuses the existing immutable PDF when retrying a failed registration', async () => {
    const attempt = { ...input, file: pdf() }
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'Sin conexión' } })
    await expect(recordContractSignature(attempt)).rejects.toThrow('Sin conexión')
    mocks.upload.mockResolvedValueOnce({ error: { message: 'Already exists', statusCode: '409' } })
    await recordContractSignature(attempt)
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1])
  })

  it('opens documents through a short-lived private URL and propagates access errors', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'private-document-url' },
      error: null,
    })
    expect(await signedContractDocumentUrl('tenant/contract/document.pdf')).toBe(
      'private-document-url',
    )
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('tenant/contract/document.pdf', 60)
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Acceso denegado' } })
    await expect(signedContractDocumentUrl('other/path.pdf')).rejects.toThrow('Acceso denegado')
  })
})
