<template>
  <section class="page">
    <h1>Test View</h1>
    <p>Usage / Total :: {{ storageInfo || '' }}</p>

    <div>
      <button @click="() => editor.setMode('check')">Check</button>
      <button @click="() => editor.setMode('erase')">Erase</button>
    </div>

    <div>
      <button @click="() => editor.setShape('dot')">Dot</button>
      <button @click="() => editor.setShape('circle')">Circle</button>
      <button @click="() => editor.setShape('check')">Check</button>
    </div>

    <div>
      <button @click="() => editor.setAllowMulti(false)">Single</button>
      <button @click="() => editor.setAllowMulti(true)">Multi</button>
    </div>

    <div class="controls">
      <label>
        Size
        <input v-model.number="markerSize" type="range" min="6" max="124" step="1" />
        {{ markerSize }}
      </label>
      <label>
        Color
        <input v-model="markerColor" type="color" />
      </label>
    </div>

    <div>
      <button @click="() => onSave()">Save</button>
      <button @click="() => onReset()">Reset</button>
    </div>

    <h2>CANVAS IMAGE</h2>
    <div class="canvas-wrap">
      <canvas
        ref="canvasRef"
        class="editor-canvas"
        :class="{ erase: editor?.mode === 'erase' }"
        @click="editor.onCanvasClick"
      />
    </div>

    <h2>SAVED IMAGE</h2>
    <div v-if="savedPreviewUrl" class="savedImage">
      <img :src="savedPreviewUrl" alt="saved" @click="onClickSavedImage" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useDrawEditor } from '@/composables/useDrawEditor'
import { useDatabase } from '@/composables/useDatabase'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import numeral from 'numeral'

import IMAGE from '@/assets/test.jpg'

const editor = ref<any>()
const canvasRef = ref<any>(null)
const storageInfo = ref('')
const markerSize = ref(18)
const markerColor = ref('#ef4444')
const savedPreviewUrl = ref('')
const savedBlobKey = ref('')
const db = useDatabase()

onMounted(async () => {
  await nextTick()
  editor.value = useDrawEditor(canvasRef)
  await editor.value.loadBaseImage(IMAGE)
  editor.value.setMarkSize(markerSize.value)
  editor.value.setMarkColor(markerColor.value)

  const es = await navigator.storage.estimate()
  storageInfo.value = `${numberToDiskSize(es.usage)} / ${numberToDiskSize(es.quota)}`
})

onUnmounted(() => {
  if (savedPreviewUrl.value) {
    URL.revokeObjectURL(savedPreviewUrl.value)
  }
})

watch(markerSize, (value) => {
  if (editor.value) {
    editor.value.setMarkSize(value)
  }
})

watch(markerColor, (value) => {
  if (editor.value) {
    editor.value.setMarkColor(value)
  }
})

function numberToDiskSize(value?: number) {
  if (!value) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'PB']
  let index = 0
  let next = value
  while (next > 1024 && index < units.length - 1) {
    next = next / 1024
    index += 1
  }
  return `${numeral(next).format('0,0.00')} ${units[index]}`
}

async function onSave() {
  const data = await editor.value.complete()
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
  editor.value.clearMarks()
}

async function onClickSavedImage() {
  if (!savedBlobKey.value) return
  const blob = await db.getImageBlob(savedBlobKey.value)
  if (!blob) return
  await editor.value.renderSavedBlob(blob)
}
</script>

<style scoped>
.page {
  display: grid;
  gap: 0.75rem;
}

.controls {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.canvas-wrap {
  overflow: hidden;
  border-radius: 10px;
  width: 580px;
  height: 400px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.editor-canvas {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  display: block;
  cursor: crosshair;
  border-radius: 8px;
}

.savedImage {
  width: 580px;
  height: 400px;
}

.savedImage img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
