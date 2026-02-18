<template>
  <section class="editor-grid">
    <div class="canvas-panel">
      <div ref="canvasWrapRef" class="canvas-wrap" />
    </div>

    <aside class="control-panel">
      <div class="button-group">
        <button @click="() => editor?.setMode('check')">Check</button>
        <button @click="() => editor?.setMode('erase')">Erase</button>
      </div>

      <div class="button-group">
        <button @click="() => editor?.setShape('dot')">Dot</button>
        <button @click="() => editor?.setShape('circle')">Circle</button>
        <button @click="() => editor?.setShape('check')">Check</button>
      </div>

      <div class="button-group">
        <button @click="() => editor?.setAllowMulti(false)">Single</button>
        <button @click="() => editor?.setAllowMulti(true)">Multi</button>
      </div>

      <div class="button-group action-buttons">
        <button :disabled="!canSave || isSaving" @click="onSave">
          {{ isSaving ? 'Saving...' : 'Save' }}
        </button>
        <button @click="() => editor?.clearMarks()">Reset</button>
        <button @click="() => editor?.resetZoom()">Reset Zoom</button>
      </div>

      <p v-if="saveError" class="error-message">{{ saveError }}</p>
      <div v-if="savedPreviewUrl" class="saved-preview-row">
        <img :src="savedPreviewUrl" alt="saved" class="saved-preview" @click="onClickSavedImage" />
      </div>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { useDrawEditor } from '@/composables/useDrawEditor'
import { useDatabase } from '@/composables/useDatabase'
import { useEditorSessionStore } from '@/stores/editorSessionStore'
import type { CanvasSession } from '@/types/canvas'

import { nextTick, onMounted, onUnmounted, ref } from 'vue'

import IMAGE from '@/assets/test.jpg'

const PAGE_KEY = 'page-d'

const editor = ref<ReturnType<typeof useDrawEditor> | null>(null)
const canvasWrapRef = ref<HTMLDivElement | null>(null)

const canSave = ref(false)
const isSaving = ref(false)
const saveError = ref('')
const savedPreviewUrl = ref('')
const savedBlobKey = ref('')
const unsubscribeMarkState = ref<(() => void) | null>(null)
const latestSavedByteSize = ref(0)
const latestSavedMimeType = ref('image/jpeg')
const latestSavedFileName = ref('')
const latestSavedWidth = ref(0)
const latestSavedHeight = ref(0)
const db = useDatabase()
const sessionStore = useEditorSessionStore()

onMounted(async () => {
  await nextTick()

  await db.purgeExpiredImageBlobs().catch(() => {})
  sessionStore.hydrateFromLocalStorage()
  await initDrawEditor()
})

onUnmounted(() => {
  disposeDrawEditor()
})

async function initDrawEditor() {
  // 기존 상태 정리
  disposeDrawEditor()

  if (!canvasWrapRef.value) {
    return
  }

  // 새 에디터 초기화
  editor.value = useDrawEditor()

  editor.value?.mountCanvas(canvasWrapRef.value)
  editor.value?.setZoomRange(1, 2)
  editor.value?.setAllowMulti(false)
  editor.value?.setMarkSize(50)
  editor.value?.setMarkColor('red')

  unsubscribeMarkState.value =
    editor.value?.onMarkStateChange(({ hasChecked }) => {
      canSave.value = hasChecked
    }) ?? null

  const previousSession = sessionStore.getSession(PAGE_KEY)
  if (previousSession) {
    const shouldRestore = window.confirm('임시 저장된 편집 상태를 불러오시겠습니까?')
    if (shouldRestore) {
      await restoreSession(previousSession)
      return
    }

    sessionStore.clearSession(PAGE_KEY)
    sessionStore.persistTempToLocalStorage()
  }

  await editor.value?.loadBaseImage(IMAGE)
}

function disposeDrawEditor() {
  unsubscribeMarkState.value?.()
  unsubscribeMarkState.value = null

  editor.value?.unmountCanvas()

  if (savedPreviewUrl.value) {
    URL.revokeObjectURL(savedPreviewUrl.value)
    savedPreviewUrl.value = ''
  }
}

async function onSave() {
  if (!canSave.value || isSaving.value) return

  isSaving.value = true
  saveError.value = ''

  try {
    const data = await editor.value?.complete({ format: 'jpeg' })
    if (!data) return

    if (savedBlobKey.value) {
      await db.deleteImageBlob(savedBlobKey.value).catch(() => {})
    }

    const blobKey = await db.putImageBlob(data.optimizedBlob)
    savedBlobKey.value = blobKey

    const blob = await db.getImageBlob(blobKey)
    if (!blob) {
      throw new Error('저장된 Blob을 다시 읽지 못했습니다.')
    }

    if (savedPreviewUrl.value) {
      URL.revokeObjectURL(savedPreviewUrl.value)
    }

    latestSavedByteSize.value = data.byteSize
    latestSavedMimeType.value = data.optimizedMimeType
    latestSavedFileName.value = data.optimizedFileName
    latestSavedWidth.value = data.width
    latestSavedHeight.value = data.height
    savedPreviewUrl.value = URL.createObjectURL(blob)

    const snapshot = editor.value?.getSessionSnapshot()
    if (snapshot) {
      sessionStore.upsertSession(PAGE_KEY, {
        ...snapshot,
        optimizedBlobKey: blobKey,
        optimizedMimeType: data.optimizedMimeType,
        optimizedFileName: data.optimizedFileName,
        byteSize: data.byteSize,
        width: data.width,
        height: data.height,
        updatedAt: Date.now(),
      })
      sessionStore.persistTempToLocalStorage()
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '저장 중 알 수 없는 오류가 발생했습니다.'
    saveError.value = message
  } finally {
    isSaving.value = false
  }
}

async function onClickSavedImage() {
  if (!savedBlobKey.value) return
  const blob = await db.getImageBlob(savedBlobKey.value)
  if (!blob) return
  await editor.value?.renderSavedBlob(blob)
}

async function restoreSession(session: CanvasSession) {
  if (session.optimizedBlobKey) {
    const blob = await db.getImageBlob(session.optimizedBlobKey)
    if (blob) {
      if (savedPreviewUrl.value) {
        URL.revokeObjectURL(savedPreviewUrl.value)
      }

      savedBlobKey.value = session.optimizedBlobKey
      latestSavedByteSize.value = session.byteSize
      latestSavedMimeType.value = session.optimizedMimeType
      latestSavedFileName.value = session.optimizedFileName
      latestSavedWidth.value = session.width
      latestSavedHeight.value = session.height
      savedPreviewUrl.value = URL.createObjectURL(blob)
      await editor.value?.renderSavedBlob(blob)
      return
    }
  }

  await editor.value?.restore({
    baseImageSrc: session.baseImageSrc,
    marks: session.marks,
  })
}
</script>

<style scoped>
.editor-grid {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 7fr 3fr;
  gap: 10px;
  padding: 10px;
  overflow: hidden;
}

.canvas-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.canvas-wrap {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 14;
  min-height: 0;
  max-height: 100%;
  margin-top: auto;
  margin-bottom: 0;
  margin-left: auto;
  margin-right: auto;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #ffffff;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

.editor-canvas {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  display: block;
  cursor: crosshair;
  border-radius: 8px;
  transform-origin: center center;
  touch-action: none;
}

.saved-preview-row {
  min-height: 0;
}

.saved-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
}

.control-panel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-auto-rows: min-content;
  align-content: start;
  gap: 8px;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #ffffff;
  overflow: hidden;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.button-group button {
  height: 32px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.control-item {
  display: grid;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.control-item input[type='range'] {
  width: 100%;
}

.color-item {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.zoom-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 76px;
  gap: 6px;
}

.zoom-input-row input[type='number'] {
  width: 100%;
}

.action-buttons {
  margin-top: 2px;
}

.error-message {
  margin: 0;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 600;
}
</style>
