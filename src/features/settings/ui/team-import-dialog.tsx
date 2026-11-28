import { Button } from '@doscientos/ui'
import { useEffect, useId, useRef, useState } from 'react'

import { downloadTextFile } from '@/shared/domain/csv'
import { buildTemplateCsv } from '@/shared/domain/table-import'
import { readSpreadsheetSheets, type SpreadsheetSheet } from '@/shared/lib/read-spreadsheet'
import { FormDialog } from '@/shared/ui/form-dialog'

import { inviteMember } from '../application/team-actions'
import {
  MAX_TEAM_IMPORT_INVITATIONS,
  previewTeamImport,
  sendTeamInvitations,
  suggestTeamImportMapping,
  teamImportHeaders,
  teamImportSchema,
  type ReadyTeamImportRow,
  type TeamImportMapping,
  type TeamImportOutcome,
  type TeamImportPlan,
} from '../application/team-import'
import { summarizeTeamImport, TeamImportResults, TeamImportReview } from './team-import-review'

const fieldClass = 'border-input bg-background w-full min-w-0 rounded-md border px-3 py-2 text-base'
const mappingFields = ['Correo', 'Nombre', 'Rol'] as const

export function TeamImportDialog({
  open,
  tenantId,
  existingEmails,
  verifyExistingEmails,
  onClose,
  onResult,
}: {
  open: boolean
  tenantId: string
  existingEmails: string[]
  verifyExistingEmails: () => Promise<string[]>
  onClose: () => void
  onResult: (message: string) => Promise<void>
}) {
  const id = useId()
  const [sheets, setSheets] = useState<SpreadsheetSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [mapping, setMapping] = useState<TeamImportMapping>({})
  const [plan, setPlan] = useState<TeamImportPlan | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmedAdmins, setConfirmedAdmins] = useState(false)
  const [reading, setReading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [outcomes, setOutcomes] = useState<TeamImportOutcome[] | null>(null)
  const readVersion = useRef(0)
  const inFlight = useRef(false)
  const stageHeading = useRef<HTMLHeadingElement>(null)

  const sheet = sheets[sheetIndex]
  const showPreview = plan !== null
  const stage = outcomes ? 'outcome' : showPreview ? 'preview' : 'mapping'
  useEffect(() => {
    if (stage !== 'mapping') stageHeading.current?.focus()
  }, [stage])
  const ready =
    plan && 'rows' in plan
      ? plan.rows.filter((row): row is ReadyTeamImportRow => row.status === 'ready')
      : []
  const adminCount = ready.filter((row) => row.invitation.role === 'admin').length
  const canSend =
    ready.length > 0 &&
    ready.length <= MAX_TEAM_IMPORT_INVITATIONS &&
    confirmed &&
    (adminCount === 0 || confirmedAdmins)

  function resetPreview() {
    setPlan(null)
    setConfirmed(false)
    setConfirmedAdmins(false)
    setError('')
  }

  function close() {
    if (inFlight.current) return
    readVersion.current += 1
    setReading(false)
    setSheets([])
    setMapping({})
    setOutcomes(null)
    resetPreview()
    onClose()
  }

  async function pick(file: File | undefined) {
    if (!file || inFlight.current) return
    const version = ++readVersion.current
    resetPreview()
    setSheets([])
    setSheetIndex(0)
    setMapping({})
    setOutcomes(null)
    setReading(true)
    try {
      const workbook = await readSpreadsheetSheets(file)
      if (version !== readVersion.current) return
      setSheets(workbook)
      if (workbook[0]) setMapping(suggestTeamImportMapping(workbook[0].rows))
    } catch (cause) {
      if (version === readVersion.current)
        setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo.')
    } finally {
      if (version === readVersion.current) setReading(false)
    }
  }

  function selectSheet(index: number) {
    const next = sheets[index]
    if (!next) return
    setSheetIndex(index)
    setMapping(suggestTeamImportMapping(next.rows))
    resetPreview()
  }

  async function send() {
    if (!canSend || inFlight.current) return
    inFlight.current = true
    setSending(true)
    setError('')
    try {
      let freshEmails: string[]
      try {
        freshEmails = await verifyExistingEmails()
      } catch {
        setError('No se pudo comprobar el equipo. No se ha iniciado ningún envío.')
        return
      }
      const result = await sendTeamInvitations(ready, freshEmails, (person) =>
        inviteMember({ tenantId, ...person }),
      )
      setSheets([])
      setMapping({})
      resetPreview()
      setOutcomes(result)
      try {
        await onResult(summarizeTeamImport(result))
      } catch {
        setError('No se pudo actualizar el equipo; recarga la página antes de reintentar.')
      }
    } finally {
      setSending(false)
      inFlight.current = false
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title={outcomes ? 'Resultado de la importación' : 'Importar personas'}
      description={
        outcomes
          ? 'Comprueba el resultado real de cada fila. No se vuelve a enviar automáticamente.'
          : 'Elige una hoja, asigna sus columnas y revisa quién recibirá acceso antes de confirmar.'
      }
      submitLabel={
        outcomes
          ? 'Cerrar'
          : sending
            ? 'Procesando…'
            : showPreview
              ? 'Confirmar e invitar'
              : 'Revisar filas'
      }
      submitDisabled={
        !outcomes && (reading || (showPreview ? !canSend : !sheet || mapping.Correo === undefined))
      }
      isSubmitting={sending}
      onSubmit={() => {
        if (outcomes) close()
        else if (showPreview) void send()
        else if (!reading && sheet && mapping.Correo !== undefined)
          setPlan(previewTeamImport(sheet.rows, mapping, existingEmails))
      }}
    >
      <div className="grid min-w-0 gap-3 sm:col-span-2">
        {!outcomes ? (
          <>
            <p className="text-muted-foreground text-sm">
              No compartas el archivo con servicios externos. Para invitar solo hace falta el
              correo; no incluyas DNI ni teléfono. Completa esos datos en la ficha privada si los
              necesitas.
            </p>
            <input
              type="file"
              accept=".xlsx,.csv,.txt"
              aria-label="Archivo de personas"
              className="border-border w-full min-w-0 rounded-md border text-sm file:mr-2 file:px-2 file:py-2"
              onChange={(event) => {
                void pick(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit max-md:min-h-11"
              onPress={() =>
                downloadTextFile('plantilla-personas.csv', buildTemplateCsv(teamImportSchema))
              }
            >
              Descargar plantilla
            </Button>
          </>
        ) : null}
        {reading ? <output className="text-sm">Cargando archivo…</output> : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        {!showPreview && sheet ? (
          <fieldset className="grid min-w-0 gap-2">
            <legend className="text-sm font-semibold">Asignar columnas</legend>
            {sheets.length > 1 ? (
              <label className="grid gap-1 text-sm" htmlFor={`${id}-sheet`}>
                Hoja del Excel
                <select
                  id={`${id}-sheet`}
                  className={fieldClass}
                  value={sheetIndex}
                  onChange={(event) => selectSheet(Number(event.target.value))}
                >
                  {sheets.map((item, index) => (
                    <option key={index} value={index}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {mappingFields.map((field) => (
              <label key={field} className="grid gap-1 text-sm">
                {field}
                {field === 'Correo' ? ' (obligatorio)' : ' (opcional)'}
                <select
                  className={fieldClass}
                  value={mapping[field] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    setMapping((current) => {
                      const next = { ...current }
                      if (value === '') delete next[field]
                      else next[field] = Number(value)
                      return next
                    })
                  }}
                >
                  <option value="">
                    {field === 'Correo' ? 'Elige una columna' : 'No importar'}
                  </option>
                  {teamImportHeaders(sheet.rows).headers.map(({ index, label }) => (
                    <option value={index} key={index}>
                      Columna {index + 1} · {label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        ) : null}
        {showPreview ? (
          <>
            <h2 ref={stageHeading} tabIndex={-1} className="font-semibold">
              Revisar invitaciones
            </h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit max-md:min-h-11"
              onPress={resetPreview}
            >
              Cambiar asignación
            </Button>
            {plan && 'fatal' in plan ? <p role="alert">{plan.fatal}</p> : null}
            {plan && 'rows' in plan ? <TeamImportReview rows={plan.rows} /> : null}
            {ready.length > MAX_TEAM_IMPORT_INVITATIONS ? (
              <p role="alert">
                Se admiten hasta {MAX_TEAM_IMPORT_INVITATIONS} invitaciones por envío. Divide el
                archivo.
              </p>
            ) : null}
            {ready.length > 0 && ready.length <= MAX_TEAM_IMPORT_INVITATIONS ? (
              <div className="space-y-2 text-sm">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="accent-primary size-5 shrink-0"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  He revisado las {ready.length} filas listas. Quiero darles acceso; las personas
                  sin cuenta recibirán un correo.
                </label>
                {adminCount ? (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
                    <input
                      type="checkbox"
                      className="accent-primary size-5 shrink-0"
                      checked={confirmedAdmins}
                      onChange={(event) => setConfirmedAdmins(event.target.checked)}
                    />
                    Confirmo que {adminCount} recibirán permisos de administrador.
                  </label>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        {outcomes ? (
          <>
            <h2 ref={stageHeading} tabIndex={-1} className="font-semibold">
              Resumen del envío
            </h2>
            <TeamImportResults outcomes={outcomes} />
          </>
        ) : null}
      </div>
    </FormDialog>
  )
}
