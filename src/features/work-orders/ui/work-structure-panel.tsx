import { Button, Card, CardContent, CardHeader, CardTitle, Input, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  applyWorkStructureCommand,
  loadWorkStructure,
  type WorkStructureAction,
  type WorkTask,
} from '../application/work-order-actions'

const taskStatusLabels: Record<WorkTask['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Terminada',
  skipped: 'Descartada',
}

export function WorkStructurePanel({
  tenantId,
  workOrderId,
  canWrite,
  onChanged,
}: {
  tenantId: string
  workOrderId: string
  canWrite: boolean
  onChanged: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const queryKey = ['work-structure', tenantId, workOrderId]
  const structure = useQuery({
    queryKey,
    queryFn: () => loadWorkStructure(tenantId, workOrderId),
  })
  const [phaseTitle, setPhaseTitle] = useState('')
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({})
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const operationIds = useRef(new Map<string, string>())

  async function run(
    action: WorkStructureAction,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    if (busy) return false
    const key = `${action}:${JSON.stringify(payload)}`
    let operationId = operationIds.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operationIds.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await applyWorkStructureCommand(tenantId, workOrderId, action, payload, operationId)
      operationIds.current.delete(key)
      await queryClient.invalidateQueries({ queryKey })
      await onChanged()
      return true
    } catch (error) {
      toast.error('No se pudo modificar el trabajo', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await queryClient.invalidateQueries({ queryKey })
      await onChanged()
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addPhase() {
    const title = phaseTitle.trim()
    if (!title) return
    if (await run('phase_added', { title })) {
      setPhaseTitle('')
      toast.success('Fase añadida')
    }
  }

  async function addTask(phaseId: string) {
    const title = (taskTitles[phaseId] ?? '').trim()
    if (!title) return
    if (await run('task_added', { phase_id: phaseId, title, notes: '' })) {
      setTaskTitles((previous) => ({ ...previous, [phaseId]: '' }))
      toast.success('Tarea añadida')
    }
  }

  async function addItem(taskId: string) {
    const label = (itemLabels[taskId] ?? '').trim()
    if (!label) return
    if (await run('checklist_item_added', { task_id: taskId, label })) {
      setItemLabels((previous) => ({ ...previous, [taskId]: '' }))
      toast.success('Comprobación añadida')
    }
  }

  if (structure.isPending) return <output>Cargando fases y tareas…</output>
  if (structure.isError) {
    return (
      <div role="alert" className="border-destructive rounded-lg border p-4 text-sm">
        No se pudo cargar la planificación: {structure.error.message}
        <Button variant="outline" className="ml-3" onPress={() => void structure.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fases, tareas y comprobaciones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {structure.data.phases.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aún no hay fases en este trabajo.</p>
        ) : null}
        {structure.data.phases.map((phase) => {
          const tasks = structure.data.tasks.filter((task) => task.phase_id === phase.id)
          return (
            <section key={phase.id} className="border-border space-y-3 rounded-lg border p-4">
              <h3 className="font-semibold">
                {phase.position}. {phase.title}
              </h3>
              {tasks.length === 0 ? (
                <p className="text-muted-foreground text-sm">Sin tareas todavía.</p>
              ) : null}
              <ol className="space-y-3">
                {tasks.map((task) => {
                  const items = structure.data.items.filter((item) => item.task_id === task.id)
                  const canComplete = items.every((item) => item.done)
                  return (
                    <li key={task.id} className="bg-surface-subtle space-y-2 rounded-lg p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="font-medium">{task.title}</h4>
                          <p className="text-muted-foreground text-xs">
                            {taskStatusLabels[task.status]}
                          </p>
                        </div>
                        {canWrite ? (
                          <div className="flex flex-wrap gap-2">
                            {task.status === 'pending' ? (
                              <Button
                                variant="outline"
                                aria-label={`Empezar tarea ${task.title}`}
                                isDisabled={busy}
                                onPress={() =>
                                  void run('task_status_changed', {
                                    task_id: task.id,
                                    status: 'in_progress',
                                    expected_updated_at: task.updated_at,
                                  })
                                }
                              >
                                Empezar
                              </Button>
                            ) : null}
                            {task.status === 'pending' || task.status === 'in_progress' ? (
                              <>
                                <Button
                                  variant="outline"
                                  aria-label={`Terminar tarea ${task.title}`}
                                  isDisabled={busy || !canComplete}
                                  onPress={() =>
                                    void run('task_status_changed', {
                                      task_id: task.id,
                                      status: 'done',
                                      expected_updated_at: task.updated_at,
                                    })
                                  }
                                >
                                  Terminar
                                </Button>
                                <Button
                                  variant="outline"
                                  aria-label={`Descartar tarea ${task.title}`}
                                  isDisabled={busy}
                                  onPress={() =>
                                    void run('task_status_changed', {
                                      task_id: task.id,
                                      status: 'skipped',
                                      expected_updated_at: task.updated_at,
                                    })
                                  }
                                >
                                  Descartar
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                aria-label={`Reabrir tarea ${task.title}`}
                                isDisabled={busy}
                                onPress={() =>
                                  void run('task_status_changed', {
                                    task_id: task.id,
                                    status: 'pending',
                                    expected_updated_at: task.updated_at,
                                  })
                                }
                              >
                                Reabrir
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </div>
                      {items.length ? (
                        <ul className="space-y-1 text-sm">
                          {items.map((item) => (
                            <li key={item.id}>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  disabled={
                                    !canWrite ||
                                    busy ||
                                    task.status === 'done' ||
                                    task.status === 'skipped'
                                  }
                                  onChange={() =>
                                    void run('checklist_item_changed', {
                                      item_id: item.id,
                                      done: !item.done,
                                      expected_updated_at: item.updated_at,
                                    })
                                  }
                                />
                                <span>{item.label}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {canWrite && task.status !== 'done' && task.status !== 'skipped' ? (
                        <div className="flex flex-wrap gap-2">
                          <Input
                            aria-label={`Nueva comprobación para ${task.title}`}
                            value={itemLabels[task.id] ?? ''}
                            onChange={(event) =>
                              setItemLabels((previous) => ({
                                ...previous,
                                [task.id]: event.target.value,
                              }))
                            }
                            placeholder="Nueva comprobación"
                            maxLength={300}
                            className="min-w-48 flex-1"
                          />
                          <Button
                            variant="outline"
                            isDisabled={busy || !(itemLabels[task.id] ?? '').trim()}
                            onPress={() => void addItem(task.id)}
                          >
                            Añadir
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <Input
                    aria-label={`Nueva tarea para ${phase.title}`}
                    value={taskTitles[phase.id] ?? ''}
                    onChange={(event) =>
                      setTaskTitles((previous) => ({
                        ...previous,
                        [phase.id]: event.target.value,
                      }))
                    }
                    placeholder="Nueva tarea"
                    maxLength={200}
                    className="min-w-48 flex-1"
                  />
                  <Button
                    variant="outline"
                    isDisabled={busy || !(taskTitles[phase.id] ?? '').trim()}
                    onPress={() => void addTask(phase.id)}
                  >
                    Añadir tarea
                  </Button>
                </div>
              ) : null}
            </section>
          )
        })}
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Nueva fase"
              value={phaseTitle}
              onChange={(event) => setPhaseTitle(event.target.value)}
              placeholder="Nueva fase"
              maxLength={160}
              className="min-w-48 flex-1"
            />
            <Button isDisabled={busy || !phaseTitle.trim()} onPress={() => void addPhase()}>
              Añadir fase
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
