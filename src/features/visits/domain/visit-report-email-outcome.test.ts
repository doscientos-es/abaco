import { describe, expect, it } from 'vitest'

import { latestReportEmailOutcome } from './visit-report-email-outcome'

describe('report email provider outcome', () => {
  it('keeps a confirmed delivery when a delayed event arrives out of order', () => {
    const outcome = latestReportEmailOutcome([
      {
        event_id: 'delivered',
        provider_message_id: 'provider-id',
        recipient_email: 'client@example.test',
        event_type: 'email.delivered',
        occurred_at: '2026-10-25T10:00:00Z',
      },
      {
        event_id: 'delayed',
        provider_message_id: 'provider-id',
        recipient_email: 'client@example.test',
        event_type: 'email.delivery_delayed',
        occurred_at: '2026-10-25T10:01:00Z',
      },
    ])
    expect(outcome?.event_type).toBe('email.delivered')
  })

  it('surfaces a complaint above delivery', () => {
    const outcome = latestReportEmailOutcome([
      {
        event_id: 'delivered',
        provider_message_id: 'provider-id',
        recipient_email: 'client@example.test',
        event_type: 'email.delivered',
        occurred_at: '2026-10-25T10:00:00Z',
      },
      {
        event_id: 'complained',
        provider_message_id: 'provider-id',
        recipient_email: 'client@example.test',
        event_type: 'email.complained',
        occurred_at: '2026-10-25T10:02:00Z',
      },
    ])
    expect(outcome?.event_type).toBe('email.complained')
  })

  it('shows a later delivery after an earlier transient bounce', () => {
    const outcome = latestReportEmailOutcome([
      {
        event_id: 'bounce',
        provider_message_id: 'provider-id',
        recipient_email: 'client@example.test',
        event_type: 'email.bounced',
        occurred_at: '2026-10-25T10:00:00Z',
      },
      {
        event_id: 'delivered',
        provider_message_id: 'provider-id',
        recipient_email: 'client@example.test',
        event_type: 'email.delivered',
        occurred_at: '2026-10-25T10:02:00Z',
      },
    ])
    expect(outcome?.event_type).toBe('email.delivered')
  })
})
