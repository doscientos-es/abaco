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
          Elige una persona o un equipo como responsable habitual. La programación se configura
          después.
        </p>
        {setup.jobs.map((job) => {
          const draft = byKey.get(`job:${job.id}`)
          return draft ? (
            <fieldset key={job.id} disabled={disabled} className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">{job.title}</legend>
              <ResponsiblePicker
                draft={draft}
                setup={setup}
                single
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
  single = false,
  disabled,
  onChange,
}: {
  draft: ContractAssignmentDraft
  setup: ContractSignatureSetup
  single?: boolean
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
          ...(!single ? [{ value: 'inherit', label: 'Responsable del trabajo' }] : []),
          { value: 'people', label: single ? 'Una persona' : 'Personas' },
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
      {draft.mode === 'people' && single ? (
        <SelectField
          label="Persona"
          isDisabled={disabled}
          value={draft.user_ids[0] ?? ''}
          options={[
            { value: '', label: 'Selecciona una persona' },
            ...setup.people.map((person) => ({ value: person.id, label: person.label })),
          ]}
          onChange={(value) => onChange({ user_ids: value ? [value] : [] })}
        />
      ) : null}
      {draft.mode === 'people' && !single ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Personas asignadas</legend>
          {setup.people.map((person) => (
            <label key={person.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
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
            <p className="text-muted-foreground text-sm">
              No hay personas disponibles. Añádelas en Equipo o elige un equipo de trabajo.
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  )
}
