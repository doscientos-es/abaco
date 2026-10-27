import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type PublicVisitReport = {
  version: number
  closedAt: string
  company: { name: string }
  client: { name: string }
  location: { name: string; address: string } | null
  asset: { name: string } | null
  visit: { title: string; actualStartAt: string; actualEndAt: string }
  report: {
    notes: string
    checklist: { label: string; done: boolean }[]
    recommendations: string
    nextActions: string
  }
  measurements: { label: string; value: number | null; unit: string; assessment: string }[]
  activities: { kind: string; description: string; quantity: number | null; unit: string }[]
  incidents: { title: string; resolution: string }[]
  photos: { phase: string; caption: string; url: string }[]
}

export async function loadPublicVisitReport(token: string): Promise<PublicVisitReport> {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<PublicVisitReport>(
    'public-visit-report',
    { body: { token } },
  )
  if (error || !data) throw new Error('El enlace no existe, ha caducado o fue revocado.')
  return data
}

export async function getPublicVisitReportPdfUrl(token: string): Promise<string> {
  const response = await fetch('/api/visit_report_pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('No se pudo preparar el PDF. Inténtalo de nuevo.')
  const result = (await response.json()) as { url?: unknown }
  const url = typeof result.url === 'string' ? result.url : ''
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL
  if (!configuredUrl) throw new Error('La descarga del PDF no está configurada.')
  const supabaseOrigin = new URL(configuredUrl).origin
  if (!url || new URL(url).origin !== supabaseOrigin) {
    throw new Error('La descarga del PDF no está disponible.')
  }
  return url
}
