function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : []
}
function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function publicPhotoReferences(snapshotValue: unknown) {
  return rows(record(snapshotValue).photos)
    .map((photo) => ({
      storagePath: string(photo.storage_path),
      phase: string(photo.phase),
      caption: string(photo.caption),
    }))
    .filter((photo) => photo.storagePath)
}

/** Explicit customer projection: never spread source objects into a public response. */
export function publicVisitReportSnapshot(
  snapshotValue: unknown,
  version: number,
  closedAt: string,
  photos: { phase: string; caption: string; url: string }[],
) {
  const snapshot = record(snapshotValue)
  const company = record(snapshot.company)
  const client = record(snapshot.client)
  const location = record(snapshot.location)
  const asset = record(snapshot.asset)
  const visit = record(snapshot.visit)
  const report = record(snapshot.report)
  const data = record(report.data)
  return {
    version,
    closedAt,
    company: { name: string(company.name) },
    client: { name: string(client.name) },
    location: snapshot.location
      ? { name: string(location.name), address: string(location.address) }
      : null,
    asset: snapshot.asset ? { name: string(asset.name) } : null,
    visit: {
      title: string(visit.title),
      actualStartAt: string(visit.actual_start_at),
      actualEndAt: string(visit.actual_end_at),
    },
    report: {
      notes: string(data.notes),
      checklist: rows(data.checklist).map((item) => ({
        label: string(item.label),
        done: item.done === true,
      })),
      recommendations: string(data.recommendations),
      nextActions: string(data.next_actions),
    },
    measurements: rows(snapshot.measurements).map((entry) => ({
      label: string(entry.label),
      value: number(entry.value),
      unit: string(entry.unit),
      assessment: string(entry.assessment),
    })),
    activities: rows(snapshot.activities).map((entry) => ({
      kind: string(entry.kind),
      description: string(entry.description),
      quantity: number(entry.quantity),
      unit: string(entry.unit),
    })),
    incidents: rows(snapshot.incidents).map((entry) => ({
      title: string(entry.title),
      resolution: string(entry.resolution),
    })),
    photos,
  }
}
