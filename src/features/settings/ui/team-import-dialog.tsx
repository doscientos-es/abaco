import { Button, toast } from '@doscientos/ui'
import { useState } from 'react'

import { downloadTextFile } from '@/shared/domain/csv'
import {
  buildAiPrompt,
  buildTemplateCsv,
  planImport,
  type ImportPlan,
} from '@/shared/domain/table-import'
import { readSpreadsheet } from '@/shared/lib/read-spreadsheet'
import { FormDialog } from '@/shared/ui/form-dialog'

import { inviteMember } from '../application/team-actions'
import {
  sendTeamInvitations,
  teamImportSchema,
  type TeamInvitation,
} from '../application/team-import'

export function TeamImportDialog({
  open,
  tenantId,
  existingEmails,
  onClose,
  onResult,
}: {
  open: boolean
  tenantId: string
  existingEmails: string[]
  onClose: () => void
  onResult: (message: string) => Promise<void>
}) {
  const [plan, setPlan] = useState<ImportPlan<TeamInvitation> | null>(null)
  const [reading, setReading] = useState(false)
  const [sending, setSending] = useState(false)
  const valid = plan && 'valid' in plan ? plan.valid : []

  function close() {
    setPlan(null)
    onClose()
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setPlan(null)
    setReading(true)
    try {
      const existing = new Set(existingEmails.map((email) => email.toLowerCase()))
      setPlan(planImport(await readSpreadsheet(file), teamImportSchema, existing))
    } catch (error) {
      setPlan({ fatal: error instanceof Error ? error.message : 'No se pudo leer el archivo.' })
    } finally {
      setReading(false)
    }
  }

  async function send() {
    setSending(true)
    const result = await sendTeamInvitations(valid, (person) =>
      inviteMember({ tenantId, ...person }),
    )
    const message = result.failed
      ? `${result.completed} procesadas. Se detuvo en ${result.failed.email}: ${result.failed.message} ${result.remaining} sin procesar. Revisa el equipo antes de reintentar.`
      : `${result.completed} personas procesadas.`
    setPlan(null)
    try {
      await onResult(message)
    } finally {
      setSending(false)
      onClose()
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title="Importar personas"
      description="Revisa el archivo antes de enviar invitaciones. Se respetan los permisos y el límite de tu plan."
      submitLabel={sending ? 'Enviando…' : `Enviar ${valid.length} invitaciones`}
      submitDisabled={reading || valid.length === 0 || valid.length > 50}
      isSubmitting={sending || reading}
      onSubmit={() => void send()}
    >
      <div className="grid gap-3 sm:col-span-2">
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          aria-label="Archivo de personas"
          onChange={(event) => {
            void pick(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPress={() =>
              downloadTextFile('plantilla-personas.csv', buildTemplateCsv(teamImportSchema))
            }
          >
            Descargar plantilla
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPress={() =>
              void navigator.clipboard
                .writeText(buildAiPrompt(teamImportSchema))
                .then(() => toast.success('Prompt copiado'))
                .catch(() => toast.error('No se pudo copiar'))
            }
          >
            Copiar prompt para IA
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          El rol vacío será Usuario. Máximo 50 personas por archivo; el plan puede permitir menos.
        </p>
        {reading ? <p>Cargando archivo…</p> : null}
        {plan && 'fatal' in plan ? <p role="alert">{plan.fatal}</p> : null}
        {plan && 'valid' in plan ? (
          <div aria-live="polite" className="text-sm">
            <p>
              {plan.valid.length} válidas · {plan.duplicates} duplicadas · {plan.errors.length} con
              errores
            </p>
            {plan.valid.length > 50 ? (
              <p role="alert">Divide el archivo en grupos de hasta 50 personas.</p>
            ) : null}
            <ul className="max-h-32 overflow-auto">
              {plan.errors.slice(0, 50).map((error) => (
                <li key={error.line}>
                  Fila {error.line}: {error.message}
                </li>
              ))}
            </ul>
            <ul className="max-h-32 overflow-auto">
              {valid.map((person) => (
                <li key={person.email}>
                  {person.email} — {person.role === 'admin' ? 'Administrador' : 'Usuario'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </FormDialog>
  )
}
