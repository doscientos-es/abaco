import { Button } from '@doscientos/ui'
import { useRef, useState } from 'react'

import { TextField, TextareaField } from '@/shared/ui/form'

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
  const dirty =
    !team ||
    name !== team.name ||
    description !== team.description ||
    archived !== team.archived ||
    JSON.stringify([...memberIds].sort()) !== JSON.stringify([...team.memberIds].sort())

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
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      className="space-y-4"
    >
      <fieldset disabled={busy} className="space-y-4">
        <legend className="mb-3 text-sm font-semibold">
          {team ? 'Editar equipo' : 'Nuevo equipo'}
        </legend>
        <TextField
          label="Nombre del equipo"
          value={name}
          onChange={setName}
          placeholder="Por ejemplo: Equipo de mantenimiento"
          maxLength={80}
        />
        <TextareaField
          label="Descripción"
          value={description}
          onChange={setDescription}
          placeholder="Especialidad o indicaciones para organizar el trabajo"
          maxLength={1000}
        />
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Personas del equipo</legend>
          <p className="text-muted-foreground text-xs">
            Una persona puede pertenecer a varios equipos. Sus permisos no cambian.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {people.map((person) => (
              <label
                key={person.id}
                className="border-border flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
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
          <output className="text-muted-foreground text-xs">
            {memberIds.length} personas seleccionadas
          </output>
          {!memberIds.length && !archived ? (
            <p className="text-muted-foreground text-xs">Selecciona al menos una persona.</p>
          ) : null}
        </fieldset>
        {team ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
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
      </fieldset>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error} Revisa los datos; si otra persona lo ha cambiado, cancela y vuelve a abrirlo.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" isDisabled={busy} onPress={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" isDisabled={busy || !parsed.success || !dirty}>
          {busy ? 'Guardando…' : 'Guardar equipo'}
        </Button>
      </div>
    </form>
  )
}
