import { Document, Page, Text, View, pdf } from '@react-pdf/renderer'

import { dateValue } from '@/shared/lib/date-range'
import { calendarDays, calendarTime, type EventCalendarView } from '@/shared/lib/event-calendar'

import type { StaffOccurrence } from '../domain/staff-schedule'

export function StaffScheduleDocument({
  date,
  view,
  occurrences,
  title,
}: {
  date: Date
  view: EventCalendarView
  occurrences: StaffOccurrence[]
  title: string
}) {
  const days = calendarDays(date, view)
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  )
  return (
    <Document title={title}>
      <Page size="A4" orientation="landscape" style={{ padding: 24, fontSize: 9 }}>
        <Text style={{ fontSize: 16, marginBottom: 6 }}>{title}</Text>
        <Text style={{ marginBottom: 10, color: '#555555' }}>
          Horario previsto · No acredita presencia real · {dateValue(days[0] ?? date)} —{' '}
          {dateValue(days[days.length - 1] ?? date)}
        </Text>
        {weeks.flatMap((week) => {
          const chunks = Math.max(
            1,
            ...week.map((day) =>
              Math.ceil(occurrences.filter((item) => item.date === dateValue(day)).length / 6),
            ),
          )
          return Array.from({ length: chunks }, (_, chunk) => (
            <View
              key={`${dateValue(week[0] ?? date)}:${chunk}`}
              style={{ flexDirection: 'row', marginBottom: 8 }}
              wrap={false}
            >
              {week.map((day) => (
                <View
                  key={dateValue(day)}
                  style={{ border: '1px solid #cccccc', padding: 5, flex: 1, minHeight: 65 }}
                >
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>
                    {new Intl.DateTimeFormat('es-ES', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    }).format(day)}
                    {chunk ? ' (cont.)' : ''}
                  </Text>
                  {occurrences
                    .filter((item) => item.date === dateValue(day))
                    .slice(chunk * 6, chunk * 6 + 6)
                    .map((item) => (
                      <Text
                        key={item.id}
                        style={{ marginBottom: 3, maxLines: 2, textOverflow: 'ellipsis' }}
                      >
                        {calendarTime(item.start)}–{calendarTime(item.end)} {item.name}
                      </Text>
                    ))}
                </View>
              ))}
            </View>
          ))
        })}
      </Page>
    </Document>
  )
}

export async function downloadSchedulePdf(
  date: Date,
  view: EventCalendarView,
  occurrences: StaffOccurrence[],
  title: string,
) {
  const blob = await pdf(
    <StaffScheduleDocument date={date} view={view} occurrences={occurrences} title={title} />,
  ).toBlob()
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = `horario-${view}-${dateValue(date)}.pdf`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
