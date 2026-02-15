const DB_NAME = 'canvas-image-db'
const DB_VERSION = 1
const STORE_NAME = 'image_blobs'
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7

interface ImageBlobRecord {
  id: string
  blob: Blob
  createdAt: number
}

export function useDatabase() {
  async function putImageBlob(blob: Blob, id = crypto.randomUUID()) {
    const db = await openDb()

    return new Promise<string>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const record: ImageBlobRecord = { id, blob, createdAt: Date.now() }
      const request = store.put(record)

      request.onsuccess = () => resolve(id)
      request.onerror = () => reject(request.error ?? new Error('Failed to store blob'))
      tx.oncomplete = () => db.close()
      tx.onerror = () => db.close()
    })
  }

  async function getImageBlob(id: string) {
    const db = await openDb()

    return new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => {
        const record = request.result as ImageBlobRecord | undefined
        resolve(record?.blob ?? null)
      }
      request.onerror = () => reject(request.error ?? new Error('Failed to load blob'))
      tx.oncomplete = () => db.close()
      tx.onerror = () => db.close()
    })
  }

  async function deleteImageBlob(id: string) {
    const db = await openDb()

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error('Failed to delete blob'))
      tx.oncomplete = () => db.close()
      tx.onerror = () => db.close()
    })
  }

  // createdAt 기준으로 유효기간이 지난 Blob을 삭제한다.
  // 기본 TTL은 7일이며, 필요 시 ttlMs로 커스텀 가능하다.
  async function purgeExpiredImageBlobs(ttlMs = DEFAULT_TTL_MS) {
    const db = await openDb()
    const expiresBefore = Date.now() - ttlMs

    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.openCursor()
      let deletedCount = 0

      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          return
        }

        const record = cursor.value as ImageBlobRecord
        if (record.createdAt < expiresBefore) {
          cursor.delete()
          deletedCount += 1
        }
        cursor.continue()
      }

      request.onerror = () => reject(request.error ?? new Error('Failed to purge expired blobs'))
      tx.oncomplete = () => {
        db.close()
        resolve(deletedCount)
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error ?? new Error('Failed to purge expired blobs'))
      }
    })
  }

  return {
    putImageBlob,
    getImageBlob,
    deleteImageBlob,
    purgeExpiredImageBlobs,
  }
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}
