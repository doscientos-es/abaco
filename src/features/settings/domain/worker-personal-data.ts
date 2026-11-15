export const MAX_WORKER_FIELD_LENGTH = 40

export function validWorkerDni(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= MAX_WORKER_FIELD_LENGTH
}

export function validWorkerPhone(value: string): boolean {
  return value.trim().length <= MAX_WORKER_FIELD_LENGTH
}
