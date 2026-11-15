/** A task occurrence has already been resolved to a local date by the contract schedule. */
export type ScheduledContractTask = {
  jobId: string
  taskId: string
  title: string
  date: string
  preferredStartMinute: number
  durationMinutes: number
}

export type DailyContractWork = {
  jobId: string
  date: string
  preferredStartMinute: number
  durationMinutes: number
  tasks: ScheduledContractTask[]
}

/** Group the tasks due for the same job and day into one order. */
export function groupContractTasks(tasks: ScheduledContractTask[]): DailyContractWork[] {
  const grouped = new Map<string, DailyContractWork>()
  const seen = new Set<string>()
  for (const task of tasks) {
    const date = new Date(`${task.date}T00:00:00Z`)
    if (
      !task.jobId ||
      !task.taskId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(task.date) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== task.date ||
      !Number.isInteger(task.preferredStartMinute) ||
      task.preferredStartMinute < 0 ||
      task.preferredStartMinute >= 1440 ||
      !Number.isInteger(task.durationMinutes) ||
      task.durationMinutes <= 0
    ) {
      throw new Error('La tarea tiene una fecha, hora o duración inválida.')
    }
    const unique = JSON.stringify([task.jobId, task.date, task.taskId])
    if (seen.has(unique)) throw new Error('La misma tarea aparece más de una vez en el mismo día.')
    seen.add(unique)
    const key = JSON.stringify([task.jobId, task.date])
    const current = grouped.get(key)
    if (current) {
      current.preferredStartMinute = Math.min(
        current.preferredStartMinute,
        task.preferredStartMinute,
      )
      current.durationMinutes += task.durationMinutes
      current.tasks.push(task)
    } else {
      grouped.set(key, {
        jobId: task.jobId,
        date: task.date,
        preferredStartMinute: task.preferredStartMinute,
        durationMinutes: task.durationMinutes,
        tasks: [task],
      })
    }
  }
  return [...grouped.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.preferredStartMinute - b.preferredStartMinute ||
      a.jobId.localeCompare(b.jobId),
  )
}
