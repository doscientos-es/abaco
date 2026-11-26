import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { validCalSignature, bookingConfirmation } from './onboarding-cal'

describe('onboarding bookings', () => {
  const event = {
    triggerEvent: 'BOOKING_CREATED',
    payload: {
      status: 'ACCEPTED',
      eventTypeId: 42,
      uid: 'booking-42',
      startTime: '2027-04-15T12:00:00Z',
      responses: { abaco_reference: { value: '00000000-0000-4000-8000-000000000001' } },
      attendees: [{ email: 'Owner@Example.test' }],
    },
  }
  it('verifies the original body and separates bookings from browser callbacks', () => {
    const raw = JSON.stringify(event)
    const signature = createHmac('sha256', 'fixture-only').update(raw).digest('hex')
    expect(validCalSignature(raw, signature, 'fixture-only')).toBe(true)
    expect(validCalSignature(raw + ' ', signature, 'fixture-only')).toBe(false)
    expect(validCalSignature(raw, 'fake', 'fixture-only')).toBe(false)
    expect(bookingConfirmation(event, '42')).toMatchObject({
      p_booking_uid: 'booking-42',
      p_attendee_emails: ['owner@example.test'],
    })
    expect(bookingConfirmation(event, '43')).toBeNull()
    expect(bookingConfirmation({ ...event, triggerEvent: 'BOOKING_REQUESTED' }, '42')).toBeNull()
    expect(
      bookingConfirmation({ ...event, payload: { ...event.payload, responses: {} } }, '42'),
    ).toBeNull()
  })
})
