import { renderToBuffer } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'

import { calendarDate } from '@/shared/lib/date-range'

import { StaffScheduleDocument } from './staff-schedule-pdf'

// Rendering real PDFs can take longer when the full test suite runs in parallel.
const pdfRenderTimeout = 30_000

describe('schedule PDF', () => {
  it(
    'renders the monthly calendar as a PDF',
    async () => {
      const buffer = await renderToBuffer(
        <StaffScheduleDocument
          date={calendarDate('2026-11-16')}
          view="month"
          occurrences={[]}
          title="Horario mensual"
        />,
      )
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
    },
    pdfRenderTimeout,
  )

  it(
    'renders a calendar and paginates crowded days without clipping the whole row',
    async () => {
      const date = calendarDate('2026-11-16')
      const occurrences = Array.from({ length: 60 }, (_, index) => ({
        id: String(index),
        userId: String(index),
        name: `Persona ${index}`,
        date: '2026-11-16',
        start: new Date(2026, 10, 16, 9),
        end: new Date(2026, 10, 16, 17),
      }))
      const buffer = await renderToBuffer(
        <StaffScheduleDocument date={date} view="week" occurrences={occurrences} title="Horario" />,
      )
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
      expect(buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length).toBeGreaterThan(1)
    },
    pdfRenderTimeout,
  )
})
