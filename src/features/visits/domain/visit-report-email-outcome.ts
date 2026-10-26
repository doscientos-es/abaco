type ProviderOutcomeEvent = {
  event_id: string
  event_type: string
  occurred_at: string
}

const eventPriority: Record<string, number> = {
  'email.delivery_delayed': 0,
  'email.delivered': 1,
  'email.bounced': 2,
  'email.failed': 2,
  'email.suppressed': 2,
  'email.complained': 3,
}

/** Terminal outcomes follow event time; a delayed notice cannot replace one. */
export function latestReportEmailOutcome<T extends ProviderOutcomeEvent>(events: T[]) {
  return [...events].sort(
    (a, b) =>
      Number(a.event_type === 'email.delivery_delayed') -
        Number(b.event_type === 'email.delivery_delayed') ||
      Date.parse(b.occurred_at) - Date.parse(a.occurred_at) ||
      (eventPriority[b.event_type] ?? 0) - (eventPriority[a.event_type] ?? 0) ||
      a.event_id.localeCompare(b.event_id),
  )[0]
}
