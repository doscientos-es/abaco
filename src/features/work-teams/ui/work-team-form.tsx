import { useRef, useState } from 'react'

import { TextField, TextareaField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { workTeamActions } from '../application/work-team-actions'
import { workTeamInput, type WorkTeam } from '../domain/work-team'

export type TeamPerson = { id: string; label: string }

export function WorkTeamForm({
  tenantId,
  team,
  people,
  onSaved,
  onCancel,
}: {
  tenantId: string
  team: WorkTeam | null
  people: TeamPerson[]
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(team?.name ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [memberIds, setMemberIds] = useState(team?.memberIds ?? [])
  const [archived, setArchived] = useState(team?.archived ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [personSearch, setPersonSearch] = useState('')
  const [identity] = useState(() => ({
    id: team?.id ?? crypto.randomUUID(),
    operationId: crypto.randomUUID(),
  }))
  const operation = useRef({ key: '', id: identity.operationId })
  const input = {
    tenantId,
    id: identity.id,
    expectedUpdatedAt: team?.updatedAt ?? null,
    name,
    description,
    memberIds,
    archived,
    operationId: identity.operationId,
  }
  const parsed = workTeamInput.safeParse(input)
  const dirty = team
    ? name !== team.name ||
      description !== team.description ||
      archived !== team.archived ||
      JSON.stringify([...memberIds].sort()) !== JSON.stringify([...team.memberIds].sort())
    : Boolean(name || description || memberIds.length || archived)
  const visiblePeople = people.filter((person) =>
    person.label.toLocaleLowerCase('es').includes(personSearch.trim().toLocaleLowerCase('es')),
  )

  async function save() {
    if (busy || !parsed.success || !dirty) return
    const key = JSON.stringify({ ...parsed.data, operationId: undefined })
    if (key !== operation.current.key) operation.current = { key, id: crypto.randomUUID() }
    setBusy(true)
    setError('')
    try {
      await workTeamActions.save({ ...parsed.data, operationId: operation.current.id })
      await onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
      title={team ? 'Editar equipo' : 'Nuevo equipo'}
      description="Agrupa personas para asignarlas juntas a los trabajos. No cambia sus permisos ni añade plazas a tu plan."
      submitLabel={busy ? 'Guardando…' : 'Guardar equipo'}
      submitDisabled={!parsed.success || !dirty}
      isSubmitting={busy}
      isDirty={dirty}
      onSubmit={() => void save()}
    >
      <TextField
        label="Nombre del equipo"
        value={name}
        onChange={setName}
        placeholder="Por ejemplo: Equipo de mantenimiento"
        maxLength={80}
        className="sm:col-span-2"
      />
      <TextareaField
        label="Descripción · opcional"
        value={description}
        onChange={setDescription}
        placeholder="Especialidad o indicaciones para organizar el trabajo"
        maxLength={1000}
        className="sm:col-span-2"
      />
      <fieldset className="min-w-0 space-y-3 sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">Personas del equipo</legend>
        <p className="text-muted-foreground text-xs">
          Selecciona al menos una persona. Puede pertenecer a varios equipos.
        </p>
        {people.length > 6 ? (
          <TextField
            label="Buscar persona"
            value={personSearch}
            onChange={setPersonSearch}
            placeholder="Nombre o correo"
          />
        ) : null}
        <div className="grid max-h-64 gap-2 overflow-y-auto p-1 sm:grid-cols-2">
          {visiblePeople.map((person) => (
            <label
              key={person.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${memberIds.includes(person.id) ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'}`}
            >
              <input
                type="checkbox"
                className="accent-primary size-4 shrink-0"
                checked={memberIds.includes(person.id)}
                onChange={(event) =>
                  setMemberIds((current) =>
                    event.target.checked
                      ? [...current, person.id]
                      : current.filter((memberId) => memberId !== person.id),
                  )
                }
              />
              <span className="min-w-0 break-words">{person.label}</span>
            </label>
          ))}
        </div>
        {!visiblePeople.length ? (
          <p className="text-muted-foreground text-sm">
            {people.length
              ? 'No hay personas con ese nombre o correo.'
              : 'No hay personas disponibles. Añádelas al equipo de la empresa antes de crear un grupo.'}
          </p>
        ) : null}
        <output aria-live="polite" className="text-muted-foreground text-xs">
          {memberIds.length}{' '}
          {memberIds.length === 1 ? 'persona seleccionada' : 'personas seleccionadas'}
        </output>
        {!memberIds.length && !archived ? (
          <p className="text-muted-foreground text-xs">Selecciona al menos una persona.</p>
        ) : null}
      </fieldset>
      {team ? (
        <label className="border-border flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="accent-primary mt-0.5 size-4 shrink-0"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />
          <span>
            Archivar equipo
            <span className="text-muted-foreground block text-xs">
              Se conserva en los trabajos existentes y deja de ofrecerse para nuevas asignaciones.
              Puedes reactivarlo aquí.
            </span>
          </span>
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {error} Revisa los datos; si otra persona lo ha cambiado, cancela y vuelve a abrirlo.
        </p>
      ) : null}
    </FormDialog>
  )
}
