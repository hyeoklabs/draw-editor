import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorSessionStore } from './editorSessionStore'

describe('editorSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('세션을 upsert하고 pageKey로 다시 조회할 수 있다', () => {
    const store = useEditorSessionStore()

    store.upsertSession('home', {
      baseImageSrc: 'mock://image',
      marks: [],
      optimizedBlobKey: 'blob-key',
      optimizedMimeType: 'image/jpeg',
      optimizedFileName: 'sample.jpg',
      byteSize: 100,
      width: 1920,
      height: 1080,
      updatedAt: Date.now(),
    })

    const session = store.getSession('home')
    expect(session).not.toBeNull()
    expect(session?.optimizedBlobKey).toBe('blob-key')
  })

  it('localStorage로 임시 저장 후 다시 hydrate할 수 있다', () => {
    const store = useEditorSessionStore()
    store.upsertSession('home', {
      baseImageSrc: 'mock://image',
      marks: [],
      optimizedBlobKey: 'blob-key',
      optimizedMimeType: 'image/jpeg',
      optimizedFileName: 'sample.jpg',
      byteSize: 100,
      width: 1920,
      height: 1080,
      updatedAt: Date.now(),
    })
    store.persistTempToLocalStorage()

    const nextStore = useEditorSessionStore()
    nextStore.hydrateFromLocalStorage()

    expect(nextStore.getSession('home')?.optimizedBlobKey).toBe('blob-key')
  })

  it('세션 JSON 크기 추정값을 바이트 단위로 반환한다', () => {
    const store = useEditorSessionStore()
    store.upsertSession('home', {
      baseImageSrc: 'mock://image',
      marks: [],
      optimizedBlobKey: 'blob-key',
      optimizedMimeType: 'image/jpeg',
      optimizedFileName: 'sample.jpg',
      byteSize: 100,
      width: 1920,
      height: 1080,
      updatedAt: Date.now(),
    })

    const bytes = store.getApproxSessionJsonBytes('home')
    expect(bytes).toBeGreaterThan(0)
  })
})
