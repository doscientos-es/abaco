import { servicePeriodicityLabels } from '@/shared/domain/service-periodicity'
import { SelectField } from '@/shared/ui/form'

import type {
  ContractAssignmentDraft,
  ContractSignatureSetup,
} from '../domain/contract-task-assignment'

export function ContractAssignmentEditor({
  setup,
  drafts,
  onChange,
  disabled,
}: {
  setup: ContractSignatureSetup
  drafts: ContractAssignmentDraft[]
  onChange: (drafts: ContractAssignmentDraft[]) => void
  disabled: boolean
}) {
  const byKey = new Map(drafts.map((draft) => [draft.task_key, draft]))
  function update(key: string, changes: Partial<ContractAssignmentDraft>) {
    onChange(drafts.map((draft) => (draft.task_key === key ? { ...draft, ...changes } : draft)))
  }
  return (
    <div className="space-y-6 sm:col-span-2">
      <section className="space-y-3" aria-label="Responsables de los trabajos">
        <h3 className="font-semibold">1. ¿Quién realizará cada trabajo?</h3>
        <p className="text-muted-foreground text-sm">
          Elige personas o un equipo para cada trabajo. La programación se configura después. Las
          visitas solo asignan una persona o un equipo, no a todas las personas del trabajo.
        </p>
        {setup.jobs.map((job) => {
          const draft = byKey.get(`job:${job.id}`)
          return draft ? (
            <fieldset key={job.id} disabled={disabled} className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">{job.title}</legend>
              <ResponsiblePicker
                draft={draft}
                setup={setup}
                job
                disabled={disabled}
                onChange={(changes) => update(draft.task_key, changes)}
              />
            </fieldset>
          ) : null
        })}
      </section>
      {setup.tasks.length ? (
        <section className="space-y-3" aria-label="Asignación de tareas del presupuesto">
          <h3 className="font-semibold">2. Tareas de los servicios presupuestados</h3>
          <p className="text-muted-foreground text-sm">
            Son las tareas del presupuesto aceptado, no de su borrador actual. Asocia cada una al
            trabajo que corresponda.
          </p>
          {setup.tasks.map((task) => {
            const draft = byKey.get(task.task_key)
            return draft ? (
              <fieldset
                key={task.task_key}
                disabled={disabled}
                className="space-y-3 rounded-lg border p-4"
              >
                <legend className="px-1 text-sm font-medium">{task.title}</legend>
                <p className="text-muted-foreground text-xs">
                  {[
                    task.section_title,
                    ...(task.periodicities ?? []).map((value) => servicePeriodicityLabels[value]),
                    task.frequency,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {task.notes ? (
                  <p className="text-muted-foreground text-sm whitespace-pre-wrap">{task.notes}</p>
                ) : null}
                <SelectField
                  label={`Trabajo de ${task.title}`}
                  value={draft.job_id}
                  isDisabled={disabled}
                  options={[
                    { value: '', label: 'Selecciona un trabajo' },
                    ...setup.jobs.map((job) => ({ value: job.id, label: job.title })),
                  ]}
                  onChange={(job_id) => update(draft.task_key, { job_id })}
                />
                <ResponsiblePicker
                  draft={draft}
                  setup={setup}
                  disabled={disabled}
                  onChange={(changes) => update(draft.task_key, changes)}
                />
              </fieldset>
            ) : null
          })}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Este presupuesto no incluye una tabla de servicios. Se asignarán los trabajos del
          contrato.
        </p>
      )}
    </div>
  )
}

function ResponsiblePicker({
  draft,
  setup,
  job = false,
  disabled,
  onChange,
}: {
  draft: ContractAssignmentDraft
  setup: ContractSignatureSetup
  job?: boolean
  disabled: boolean
  onChange: (changes: Partial<ContractAssignmentDraft>) => void
}) {
  return (
    <div className="space-y-3">
      <SelectField
        label="Asignar a"
        isDisabled={disabled}
        value={draft.mode}
        options={[
          ...(!job ? [{ value: 'inherit', label: 'Responsables del trabajo' }] : []),
          { value: 'people', label: 'Personas' },
          { value: 'team', label: 'Un equipo' },
        ]}
        onChange={(mode) =>
          onChange({ mode: mode as ContractAssignmentDraft['mode'], user_ids: [], team_id: null })
        }
      />
      {draft.mode === 'team' ? (
        <SelectField
          label="Equipo"
          isDisabled={disabled}
          value={draft.team_id ?? ''}
          options={[
            { value: '', label: 'Selecciona un equipo' },
            ...setup.teams.map((team) => ({ value: team.id, label: team.name })),
          ]}
          onChange={(value) => onChange({ team_id: value || null })}
        />
      ) : null}
      {draft.mode === 'team' && draft.team_id ? (
        <div className="flex flex-wrap gap-2" aria-label="Miembros del equipo">
          {setup.people
            .filter((person) =>
              setup.teams.find((team) => team.id === draft.team_id)?.memberIds?.includes(person.id),
            )
            .map((person) => (
              <span
                key={person.id}
                className="bg-muted inline-flex items-center gap-2 rounded-full pr-3 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-xs font-semibold"
                >
                  {person.label
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                    .toLocaleUpperCase()}
                </span>
                {person.label}
              </span>
            ))}
        </div>
      ) : null}
      {draft.mode === 'people' ? (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Personas asignadas · {draft.user_ids.length || 'Seleccionar'}
          </summary>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Personas seleccionadas">
            {setup.people
              .filter((person) => draft.user_ids.includes(person.id))
              .map((person) => (
                <span
                  key={person.id}
                  className="bg-muted inline-flex items-center gap-2 rounded-full pr-3 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-xs font-semibold"
                  >
                    {person.label
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toLocaleUpperCase()}
                  </span>
                  {person.label}
                </span>
              ))}
          </div>
          <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
            {setup.people.map((person) => (
              <label
                key={person.id}
                className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm"
              >
                <input
                  type="checkbox"
                  disabled={
                    disabled || (!draft.user_ids.includes(person.id) && draft.user_ids.length >= 30)
                  }
                  checked={draft.user_ids.includes(person.id)}
                  onChange={(event) =>
                    onChange({
                      user_ids: event.target.checked
                        ? [...draft.user_ids, person.id]
                        : draft.user_ids.filter((id) => id !== person.id),
                    })
                  }
                />
                {person.label}
              </label>
            ))}
            {!setup.people.length ? (
              <p className="text-muted-foreground text-sm">No hay personas disponibles.</p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  )
}
