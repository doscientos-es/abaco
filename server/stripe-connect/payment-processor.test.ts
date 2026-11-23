import { describe, expect, it, vi } from 'vitest'

import { processConnectPayment, type StripePaymentStore } from './payment-processor'

const expected = {
  accountId: 'acct_ABC123',
  operationId: 'bd000000-0000-4000-8000-000000000001',
  sessionId: 'cs_test_ABC123',
  amountCents: 12500,
  liveMode: false,
}
const session = {
  id: expected.sessionId,
  object: 'checkout.session',
  livemode: false,
  mode: 'payment',
  payment_status: 'paid',
  currency: 'eur',
  amount_total: expected.amountCents,
  client_reference_id: expected.operationId,
  metadata: { operation_id: expected.operationId },
  payment_intent: 'pi_ABC123',
}
const event = {
  id: 'evt_ABC123',
  type: 'checkout.session.completed',
  account: expected.accountId,
  livemode: false,
  data: { object: session },
}

function store() {
  const findReservation = vi.fn<StripePaymentStore['findReservation']>().mockResolvedValue(expected)
  const settlePayment = vi.fn<StripePaymentStore['settlePayment']>()
  const repository: StripePaymentStore = { findReservation, settlePayment }
  return { repository, findReservation, settlePayment }
}

describe('stored Stripe payment processing', () => {
  it('settles only a matching paid checkout and passes the payment identity to the transaction', async () => {
    const { repository, settlePayment } = store()
    await expect(processConnectPayment(event, repository)).resolves.toBe('settled')
    expect(settlePayment).toHaveBeenCalledWith('evt_ABC123', expected, 'pi_ABC123')
  })

  it('settles an asynchronously confirmed checkout', async () => {
    const { repository, settlePayment } = store()
    await expect(
      processConnectPayment(
        { ...event, type: 'checkout.session.async_payment_succeeded' },
        repository,
      ),
    ).resolves.toBe('settled')
    expect(settlePayment).toHaveBeenCalledWith('evt_ABC123', expected, 'pi_ABC123')
  })

  it('ignores unrelated and initially unpaid events without issuing an invoice', async () => {
    const { repository, findReservation, settlePayment } = store()
    await expect(
      processConnectPayment({ ...event, type: 'account.updated' }, repository),
    ).resolves.toBe('ignored')
    await expect(
      processConnectPayment(
        { ...event, data: { object: { ...session, payment_status: 'unpaid' } } },
        repository,
      ),
    ).resolves.toBe('ignored')
    expect(findReservation).not.toHaveBeenCalled()
    expect(settlePayment).not.toHaveBeenCalled()
  })

  it('retries when the checkout reservation is not available yet', async () => {
    const { repository, findReservation, settlePayment } = store()
    findReservation.mockResolvedValue(null)
    await expect(processConnectPayment(event, repository)).rejects.toThrow(
      'reservation unavailable',
    )
    expect(settlePayment).not.toHaveBeenCalled()
  })

  it('rejects invalid operation identifiers before querying the reservation store', async () => {
    const { repository, findReservation } = store()
    const invalid = {
      ...event,
      data: { object: { ...session, metadata: { operation_id: 'bad' } } },
    }
    await expect(processConnectPayment(invalid, repository)).rejects.toThrow(
      'Invalid Stripe payment operation',
    )
    expect(findReservation).not.toHaveBeenCalled()
  })

  it.each([
    { ...event, account: 'acct_Other' },
    { ...event, livemode: true },
    { ...event, data: { object: { ...session, amount_total: 1 } } },
    { ...event, data: { object: { ...session, id: 'cs_test_Other' } } },
    {
      ...event,
      type: 'checkout.session.async_payment_succeeded',
      data: { object: { ...session, payment_status: 'unpaid' } },
    },
  ])('rejects mismatched payment data', async (mismatch) => {
    const { repository, settlePayment } = store()
    await expect(processConnectPayment(mismatch, repository)).rejects.toThrow('does not match')
    expect(settlePayment).not.toHaveBeenCalled()
  })

  it('propagates transaction failures so the worker can retry', async () => {
    const { repository, settlePayment } = store()
    settlePayment.mockRejectedValue(new Error('database unavailable'))
    await expect(processConnectPayment(event, repository)).rejects.toThrow('database unavailable')
  })
})
