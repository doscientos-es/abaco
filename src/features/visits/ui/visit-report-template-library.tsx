import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useSession } from '@/features/auth'
import { useActionLock } from '@/shared/lib/use-action-lock'
import { TextareaField } from '@/shared/ui/form'

import {
  publishVisitReportTemplate,
  saveVisitReportTemplateDraft,
  visitReportTemplatesQuery,
} from '../application/visit-report-template-actions'
import {
  parseTemplateLabels,
  visitReportTemplatePresets,
  type VisitReportTemplate,
} from '../domain/visit-report-templates'

export function VisitReportTemplateLibrary({ tenantId }: { tenantId: string }) {
  const session = useSession()
  if (session?.role !== 'admin' || session.tenantId !== tenantId || !session.userId) return null
  return <TemplateLibrary key={session.userId} tenantId={tenantId} userId={session.userId} />
}

function TemplateLibrary({ tenantId, userId }: { tenantId: string; userId: string }) {
  const options = visitReportTemplatesQuery(tenantId, userId)
  const templates = useQuery(options)
  const queryClient = useQueryClient()

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: options.queryKey })
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Plantillas de parte por servicio</h2>
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Prepara una lista y publícala cuando esté lista. Después podrás copiarla a una visita
          programada desde su parte. Publicar cambios no modifica los partes ya creados.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates.isPending ? <output>Cargando plantillas…</output> : null}
        {templates.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-destructive text-sm">
              No se pudieron cargar las plantillas.
            </p>
            <Button variant="outline" className="min-h-11" onPress={() => void templates.refetch()}>
              Reintentar carga de plantillas
            </Button>
          </div>
        ) : null}
        {templates.data
          ? visitReportTemplatePresets.map((preset) => (
              <TemplateDraft
                key={preset.kind}
                tenantId={tenantId}
                preset={preset}
                snapshot={templates.data.find((item) => item.service_kind === preset.kind)}
                refresh={refresh}
              />
            ))
          : null}
      </CardContent>
    </Card>
  )
}

type Edit = { revision: number; text: string }

function TemplateDraft({
  preset,
  snapshot,
  tenantId,
  refresh,
}: {
  preset: (typeof visitReportTemplatePresets)[number]
  snapshot: VisitReportTemplate | undefined
  tenantId: string
  refresh: () => Promise<void>
}) {
  const revision = snapshot?.draft_revision ?? 0
  const original = (snapshot?.draft_labels ?? preset.labels).join('\n')
  const [edit, setEdit] = useState<Edit | null>(null)
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const lock = useActionLock()
  const text = edit?.text ?? original
  const dirty = Boolean(edit && text !== original)
  const stale = Boolean(edit && edit.revision !== revision)
  const validation = parseTemplateLabels(text)
  const published = snapshot?.published_version ?? null
  const canSave = !busy && !stale && 'labels' in validation && (dirty || !revision)
  const canPublish = !busy && !edit && revision > 0 && published !== revision

  async function submit(action: 'save' | 'publish') {
    if ((action === 'save' ? !canSave : !canPublish) || !lock.acquire()) return
    setBusy(action)
    setFeedback('')
    setError('')
    try {
      if (action === 'save' && 'labels' in validation)
        await saveVisitReportTemplateDraft(tenantId, preset.kind, revision, validation.labels)
      else if (action === 'publish')
        await publishVisitReportTemplate(tenantId, preset.kind, revision)
      setEdit(null)
      await refresh()
      setFeedback(action === 'save' ? 'Borrador guardado.' : 'Plantilla publicada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar el cambio.')
      await refresh()
    } finally {
      setBusy(null)
      lock.release()
    }
  }

  return (
    <details className="border-border min-w-0 rounded-lg border">
      <summary className="focus-visible:ring-ring min-h-11 cursor-pointer rounded-lg p-3 text-sm focus-visible:ring-2 focus-visible:outline-none">
        <span className="font-semibold">{preset.title}</span>
        <span className="text-muted-foreground ml-2">
          {published ? `Publicada · v${published}` : 'Sin publicar'}
          {revision > 0 && revision !== published ? ' · Borrador guardado' : ''}
        </span>
      </summary>
      <div className="space-y-3 px-3 pb-3">
        <p className="text-muted-foreground text-sm">
          Una comprobación por línea. Usa indicaciones de trabajo; pueden aparecer en el parte que
          se comparte con el cliente.
        </p>
        <fieldset disabled={busy !== null} className="min-w-0">
          <TextareaField
            label={`Comprobaciones de ${preset.title}`}
            value={text}
            placeholder="Una comprobación por línea"
            maxLength={3220}
            onChange={(next) => {
              setFeedback('')
              setError('')
              setEdit(
                next === original && !stale
                  ? null
                  : { revision: edit?.revision ?? revision, text: next },
              )
            }}
          />
        </fieldset>
        {'error' in validation && <p className="text-destructive text-sm">{validation.error}</p>}
        {stale ? (
          <p role="alert" className="text-destructive text-sm">
            Hay un borrador más reciente. Puedes copiar tus cambios antes de cargarlo.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <output className="text-muted-foreground block text-sm empty:sr-only">{feedback}</output>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            className="min-h-11"
            variant="outline"
            isDisabled={!canSave}
            onPress={() => void submit('save')}
          >
            {busy === 'save' ? 'Guardando…' : 'Guardar borrador'}
          </Button>
          <Button
            className="min-h-11"
            isDisabled={!canPublish}
            onPress={() => void submit('publish')}
          >
            {busy === 'publish' ? 'Publicando…' : 'Publicar plantilla'}
          </Button>
          {stale ? (
            <Button className="min-h-11" variant="ghost" onPress={() => setEdit(null)}>
              Cargar último borrador
            </Button>
          ) : null}
        </div>
      </div>
    </details>
  )
}
