<template>
  <section class="editor-grid">
    <div class="canvas-panel">
      <div ref="canvasWrapRef" class="canvas-wrap" />

      <div v-if="savedPreviewUrl" class="saved-preview-row">
        <img :src="savedPreviewUrl" alt="saved" class="saved-preview" @click="onClickSavedImage" />
      </div>
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

      <label class="control-item">
        <span>Mark Size: {{ markerSize }}</span>
        <input v-model.number="markerSize" type="range" min="6" max="124" step="1" />
      </label>

      <label class="control-item color-item">
        <span>Mark Color</span>
        <input v-model="markerColor" type="color" />
      </label>

      <label class="control-item">
        <span>Min Zoom: {{ zoomMin.toFixed(2) }}x</span>
        <div class="zoom-input-row">
          <input v-model.number="zoomMin" type="range" min="1" :max="zoomMax" step="0.1" />
          <input v-model.number="zoomMin" type="number" min="1" :max="zoomMax" step="0.1" />
        </div>
      </label>

      <label class="control-item">
        <span>Max Zoom: {{ zoomMax.toFixed(2) }}x</span>
        <div class="zoom-input-row">
          <input v-model.number="zoomMax" type="range" :min="zoomMin" max="8" step="0.1" />
          <input v-model.number="zoomMax" type="number" :min="zoomMin" max="8" step="0.1" />
        </div>
      </label>

      <div class="button-group action-buttons">
        <button @click="onSave">Save</button>
        <button @click="onReset">Reset</button>
        <button @click="() => editor?.resetZoom()">Reset Zoom</button>
      </div>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { useDrawEditor } from '@/composables/useDrawEditor'
import { useDatabase } from '@/composables/useDatabase'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import IMAGE from '@/assets/test.jpg'

const editor = ref<ReturnType<typeof useDrawEditor> | null>(null)
const canvasWrapRef = ref<HTMLDivElement | null>(null)

const markerSize = ref(54)
const markerColor = ref('#ef4444')
const zoomMin = ref(1)
const zoomMax = ref(4)
const savedPreviewUrl = ref('')
const savedBlobKey = ref('')
const db = useDatabase()

onMounted(async () => {
  await nextTick()
  await db.purgeExpiredImageBlobs().catch(() => {})

  editor.value = useDrawEditor()
  if (canvasWrapRef.value) {
    editor.value?.mountCanvas(canvasWrapRef.value)
  }
  editor.value?.setZoomRange(zoomMin.value, zoomMax.value)
  await editor.value?.loadBaseImage(IMAGE)
  editor.value?.setMarkSize(markerSize.value)
  editor.value?.setMarkColor(markerColor.value)
})

onUnmounted(() => {
  editor.value?.unmountCanvas()

  if (savedPreviewUrl.value) {
    URL.revokeObjectURL(savedPreviewUrl.value)
  }
})

watch(markerSize, (value) => {
  editor.value?.setMarkSize(value)
})

watch(markerColor, (value) => {
  editor.value?.setMarkColor(value)
})

watch(zoomMin, (value) => {
  const normalized = Number.isFinite(value) ? Math.max(1, Number(value.toFixed(1))) : 1

  if (normalized !== value) {
    zoomMin.value = normalized
    return
  }

  if (zoomMax.value < normalized) {
    zoomMax.value = normalized
  }

  editor.value?.setZoomRange(normalized, zoomMax.value)
})

watch(zoomMax, (value) => {
  const normalized = Number.isFinite(value) ? Math.max(zoomMin.value, Number(value.toFixed(1))) : 4

  if (normalized !== value) {
    zoomMax.value = normalized
    return
  }

  editor.value?.setZoomRange(zoomMin.value, normalized)
})

async function onSave() {
  const data = await editor.value?.complete()
  if (!data) return

  if (savedBlobKey.value) {
    await db.deleteImageBlob(savedBlobKey.value).catch(() => {})
  }

  const blobKey = await db.putImageBlob(data.optimizedBlob)
  savedBlobKey.value = blobKey

  const blob = await db.getImageBlob(blobKey)
  if (!blob) return

  if (savedPreviewUrl.value) {
    URL.revokeObjectURL(savedPreviewUrl.value)
  }

  savedPreviewUrl.value = URL.createObjectURL(blob)
}

function onReset() {
  editor.value?.clearMarks()
}

async function onClickSavedImage() {
  if (!savedBlobKey.value) return
  const blob = await db.getImageBlob(savedBlobKey.value)
  if (!blob) return
  await editor.value?.renderSavedBlob(blob)
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
</style>
