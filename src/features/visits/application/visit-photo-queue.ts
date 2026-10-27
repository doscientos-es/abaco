import type { VisitPhotoPhase } from '../infrastructure/visit-photo-repository'

const databaseName = 'abaco-visit-evidence'
const storeName = 'pending-photos'

export type PendingVisitPhoto = {
  key: string
  userId: string
  tenantId: string
  visitId: string
  photoId: string
  operationId: string
  phase: VisitPhotoPhase
  caption: string
  name: string
  mimeType: string
  lastModified: number
  blob: Blob
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Este navegador no permite guardar fotografías pendientes.'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la cola de fotos.'))
    request.onblocked = () =>
      reject(new Error('Cierra otras pestañas de Ábaco e inténtalo de nuevo.'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = action(transaction.objectStore(storeName))
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('No se pudo guardar la cola de fotos.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('Se interrumpió el guardado de la foto.'))
    }
  })
}

export function visitPhotoQueueKey(
  userId: string,
  tenantId: string,
  visitId: string,
  photoId: string,
) {
  return `${userId}:${tenantId}:${visitId}:${photoId}`
}

export async function listPendingVisitPhotos(userId: string, tenantId: string, visitId: string) {
  if (typeof indexedDB === 'undefined' || typeof IDBKeyRange === 'undefined') {
    throw new Error('Este navegador no permite guardar fotografías pendientes.')
  }
  const prefix = `${userId}:${tenantId}:${visitId}:`
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`)
  const items = await withStore<PendingVisitPhoto[]>('readonly', (store) => store.getAll(range))
  return items.filter(
    (item) => item.userId === userId && item.tenantId === tenantId && item.visitId === visitId,
  )
}

export async function savePendingVisitPhoto(photo: PendingVisitPhoto) {
  await withStore<IDBValidKey>('readwrite', (store) => store.put(photo))
}

export async function removePendingVisitPhoto(key: string) {
  await withStore<undefined>('readwrite', (store) => store.delete(key))
}

export async function clearPendingVisitPhotos() {
  if (typeof indexedDB === 'undefined') return
  await withStore<undefined>('readwrite', (store) => store.clear())
}
