const DB_NAME = 'canvas-image-db'
const DB_VERSION = 1
const STORE_NAME = 'image_blobs'

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

  return {
    putImageBlob,
    getImageBlob,
    deleteImageBlob,
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
