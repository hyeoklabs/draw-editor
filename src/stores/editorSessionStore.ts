import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CanvasSession, CanvasSessionMap } from '@/types/canvas'

const TEMP_STORAGE_KEY = 'draw-editor:temp-sessions:v1'

interface TempStoragePayload {
  sessions: CanvasSessionMap
  updatedAt: number
}

export const useEditorSessionStore = defineStore('editor-session', () => {
  const sessionsByPage = ref<CanvasSessionMap>({})

  function getSession(pageKey: string) {
    return sessionsByPage.value[pageKey] ?? null
  }

  function upsertSession(pageKey: string, session: CanvasSession) {
    sessionsByPage.value[pageKey] = {
      ...session,
      updatedAt: Date.now(),
    }
  }

  function clearSession(pageKey: string) {
    if (!(pageKey in sessionsByPage.value)) {
      return
    }

    const next: CanvasSessionMap = { ...sessionsByPage.value }
    delete next[pageKey]
    sessionsByPage.value = next
  }

  function persistTempToLocalStorage() {
    const payload: TempStoragePayload = {
      sessions: sessionsByPage.value,
      updatedAt: Date.now(),
    }

    localStorage.setItem(TEMP_STORAGE_KEY, JSON.stringify(payload))
  }

  function hydrateFromLocalStorage() {
    const raw = localStorage.getItem(TEMP_STORAGE_KEY)
    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw) as Partial<TempStoragePayload>
      if (!parsed.sessions || typeof parsed.sessions !== 'object') {
        return
      }

      sessionsByPage.value = parsed.sessions as CanvasSessionMap
    } catch {
      // 파싱 불가 시 손상된 임시 데이터로 간주하고 제거한다.
      localStorage.removeItem(TEMP_STORAGE_KEY)
    }
  }

  function getApproxSessionJsonBytes(pageKey: string) {
    const session = sessionsByPage.value[pageKey]
    if (!session) {
      return 0
    }

    return new Blob([JSON.stringify(session)]).size
  }

  return {
    sessionsByPage,
    getSession,
    upsertSession,
    clearSession,
    persistTempToLocalStorage,
    hydrateFromLocalStorage,
    getApproxSessionJsonBytes,
  }
})
