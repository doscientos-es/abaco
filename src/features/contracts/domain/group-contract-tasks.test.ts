import { describe, expect, it } from 'vitest'

import { groupContractTasks } from './group-contract-tasks'

const task = {
  jobId: 'job-1',
  taskId: 'task-1',
  title: 'Cristales',
  date: '2026-11-16',
  preferredStartMinute: 600,
  durationMinutes: 30,
}
describe('groupContractTasks', () => {
  it('sums tasks due for the same job on the same day, starting at the earliest preferred time', () => {
    const result = groupContractTasks([
      task,
      { ...task, taskId: 'task-2', preferredStartMinute: 540, durationMinutes: 45 },
      { ...task, taskId: 'task-3', date: '2026-11-17' },
      { ...task, jobId: 'job-2' },
    ])
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({
      jobId: 'job-1',
      preferredStartMinute: 540,
      durationMinutes: 75,
      tasks: [task, expect.objectContaining({ taskId: 'task-2' })],
    })
  })
  it('rejects invalid or duplicated occurrences instead of silently inflating the duration', () => {
    expect(() => groupContractTasks([task, task])).toThrow()
    expect(() => groupContractTasks([{ ...task, durationMinutes: 0 }])).toThrow()
    expect(() => groupContractTasks([{ ...task, date: '2026-02-30' }])).toThrow()
  })
})
