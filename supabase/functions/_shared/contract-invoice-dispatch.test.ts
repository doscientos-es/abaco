import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dispatchContractInvoiceEmail } from './contract-invoice-dispatch'
import type * as Resend from './resend'
import { EmailSendError } from './resend'

const { sendEmail, buildEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(), buildEmail: vi.fn() }))
vi.mock('./resend.ts', async (original) => ({
  ...(await original<typeof Resend>()),
  sendEmail,
}))
vi.mock('./contract-invoice-email.ts', () => ({ contractInvoiceEmail: buildEmail }))

function fixture() {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({
      data: [
        {
          invoice_id: 'invoice-1',
          lease_token: 'lease-1',
          sender_address: 'from@example.test',
          payload: {},
        },
      ],
    })
    .mockResolvedValue({ data: true })
  return { rpc, admin: { rpc } as never }
}

beforeEach(() => {
  vi.resetAllMocks()
  buildEmail.mockReturnValue({
    to: 'client@example.test',
    text: 'Factura',
    html: '<p>Factura</p>',
    subject: 'Factura',
  })
  sendEmail.mockResolvedValue('provider-1')
})

describe('contract invoice dispatch', () => {
  it('uses a stable idempotency key and records provider acceptance', async () => {
    const { admin, rpc } = fixture()
    expect(await dispatchContractInvoiceEmail(admin, 'from@example.test')).toBe(true)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'contract-invoice/invoice-1',
        fromAddress: 'from@example.test',
      }),
    )
    expect(rpc).toHaveBeenLastCalledWith(
      'finish_contract_invoice_delivery',
      expect.objectContaining({
        p_lease_token: 'lease-1',
        p_outcome: 'sent',
        p_provider_email_id: 'provider-1',
      }),
    )
  })

  it.each([
    [503, 'retry'],
    [429, 'retry'],
    [422, 'failed'],
  ])('classifies provider %s as %s', async (status, outcome) => {
    const { admin, rpc } = fixture()
    sendEmail.mockRejectedValue(new EmailSendError(status as number))
    await dispatchContractInvoiceEmail(admin, 'from@example.test')
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_outcome: outcome,
      p_error_code: `provider_${status}`,
    })
  })

  it('does not reclassify a database failure after the email was accepted', async () => {
    const { admin, rpc } = fixture()
    rpc.mockResolvedValueOnce({ error: { code: 'database_error' } })
    await expect(dispatchContractInvoiceEmail(admin, 'from@example.test')).rejects.toThrow(
      'finish_failed',
    )
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('does not send when no delivery could be leased', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [] })
    expect(await dispatchContractInvoiceEmail({ rpc } as never, 'from@example.test')).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('fails invalid documents without sending or exposing their contents', async () => {
    const { admin, rpc } = fixture()
    buildEmail.mockImplementation(() => {
      throw new Error('invalid')
    })
    await dispatchContractInvoiceEmail(admin, 'from@example.test')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_outcome: 'failed',
      p_error_code: 'invoice_invalid',
    })
  })
})
