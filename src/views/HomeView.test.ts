import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import HomeView from './HomeView.vue'

const useDrawEditorMock = vi.fn()
const useDatabaseMock = vi.fn()
type MarkState = { hasChecked: boolean; markCount: number }
// eslint-disable-next-line no-unused-vars
type MarkStateListener = (..._params: [MarkState]) => void

vi.mock('@/composables/useDrawEditor', () => ({
  useDrawEditor: () => useDrawEditorMock(),
}))

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => useDatabaseMock(),
}))

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('HomeView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('체크 상태 이벤트에 따라 Save 버튼이 활성/비활성된다', async () => {
    let markStateListener: MarkStateListener | null = null

    const editorMock = {
      mountCanvas: vi.fn(),
      unmountCanvas: vi.fn(),
      onMarkStateChange: vi.fn((listener: MarkStateListener) => {
        markStateListener = listener
        listener({ hasChecked: false, markCount: 0 })
        return vi.fn()
      }),
      setZoomRange: vi.fn(),
      loadBaseImage: vi.fn(async () => {}),
      setMarkSize: vi.fn(),
      setMarkColor: vi.fn(),
      complete: vi.fn(async () => null),
      clearMarks: vi.fn(),
      renderSavedBlob: vi.fn(async () => {}),
      resetZoom: vi.fn(),
      setMode: vi.fn(),
      setShape: vi.fn(),
      setAllowMulti: vi.fn(),
    }

    const dbMock = {
      purgeExpiredImageBlobs: vi.fn(async () => {}),
      deleteImageBlob: vi.fn(async () => {}),
      putImageBlob: vi.fn(async () => 'blob-key'),
      getImageBlob: vi.fn(async () => new Blob(['mock'], { type: 'image/jpeg' })),
    }

    useDrawEditorMock.mockReturnValue(editorMock)
    useDatabaseMock.mockReturnValue(dbMock)

    const wrapper = mount(HomeView)
    await nextTick()
    await flushPromises()

    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Save')

    if (!saveButton) {
      throw new Error('Save button not found')
    }

    expect(saveButton.attributes('disabled')).toBeDefined()

    markStateListener?.({ hasChecked: true, markCount: 1 })
    await nextTick()

    expect(saveButton.attributes('disabled')).toBeUndefined()
  })

  it('Save 버튼 활성 상태에서 클릭하면 저장 플로우를 수행한다', async () => {
    let markStateListener: MarkStateListener | null = null

    const completeResult = {
      optimizedAsset: {
        dataUrl: 'data:image/jpeg;base64,mock',
        blob: new Blob(['mock'], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg',
      },
      baseImageSrc: 'mock://image',
      marks: [],
      optimizedDataUrl: 'data:image/jpeg;base64,mock',
      optimizedBlob: new Blob(['mock'], { type: 'image/jpeg' }),
      optimizedFile: new File([new Blob(['mock'])], 'test.jpg', { type: 'image/jpeg' }),
      optimizedMimeType: 'image/jpeg',
      optimizedFileName: 'test.jpg',
      byteSize: 4,
      width: 1920,
      height: 1080,
    }

    const editorMock = {
      mountCanvas: vi.fn(),
      unmountCanvas: vi.fn(),
      onMarkStateChange: vi.fn((listener: MarkStateListener) => {
        markStateListener = listener
        listener({ hasChecked: false, markCount: 0 })
        return vi.fn()
      }),
      setZoomRange: vi.fn(),
      loadBaseImage: vi.fn(async () => {}),
      setMarkSize: vi.fn(),
      setMarkColor: vi.fn(),
      complete: vi.fn(async () => completeResult),
      clearMarks: vi.fn(),
      renderSavedBlob: vi.fn(async () => {}),
      resetZoom: vi.fn(),
      setMode: vi.fn(),
      setShape: vi.fn(),
      setAllowMulti: vi.fn(),
    }

    const dbMock = {
      purgeExpiredImageBlobs: vi.fn(async () => {}),
      deleteImageBlob: vi.fn(async () => {}),
      putImageBlob: vi.fn(async () => 'blob-key'),
      getImageBlob: vi.fn(async () => new Blob(['saved'], { type: 'image/jpeg' })),
    }

    useDrawEditorMock.mockReturnValue(editorMock)
    useDatabaseMock.mockReturnValue(dbMock)

    const wrapper = mount(HomeView)
    await nextTick()
    await flushPromises()

    markStateListener?.({ hasChecked: true, markCount: 1 })
    await nextTick()

    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Save')

    if (!saveButton) {
      throw new Error('Save button not found')
    }

    await saveButton.trigger('click')
    await nextTick()
    await flushPromises()

    expect(editorMock.complete).toHaveBeenCalledTimes(1)
    expect(dbMock.putImageBlob).toHaveBeenCalledTimes(1)
    expect(dbMock.getImageBlob).toHaveBeenCalledTimes(1)
  })

  it('체크가 없으면 Save 클릭 시 저장 플로우를 호출하지 않는다', async () => {
    const editorMock = {
      mountCanvas: vi.fn(),
      unmountCanvas: vi.fn(),
      onMarkStateChange: vi.fn((listener: MarkStateListener) => {
        listener({ hasChecked: false, markCount: 0 })
        return vi.fn()
      }),
      setZoomRange: vi.fn(),
      loadBaseImage: vi.fn(async () => {}),
      setMarkSize: vi.fn(),
      setMarkColor: vi.fn(),
      complete: vi.fn(async () => null),
      clearMarks: vi.fn(),
      renderSavedBlob: vi.fn(async () => {}),
      resetZoom: vi.fn(),
      setMode: vi.fn(),
      setShape: vi.fn(),
      setAllowMulti: vi.fn(),
    }

    const dbMock = {
      purgeExpiredImageBlobs: vi.fn(async () => {}),
      deleteImageBlob: vi.fn(async () => {}),
      putImageBlob: vi.fn(async () => 'blob-key'),
      getImageBlob: vi.fn(async () => null),
    }

    useDrawEditorMock.mockReturnValue(editorMock)
    useDatabaseMock.mockReturnValue(dbMock)

    const wrapper = mount(HomeView)
    await nextTick()
    await flushPromises()

    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Save')

    if (!saveButton) {
      throw new Error('Save button not found')
    }

    expect(saveButton.attributes('disabled')).toBeDefined()
    await saveButton.trigger('click')
    await nextTick()
    await flushPromises()

    expect(editorMock.complete).not.toHaveBeenCalled()
    expect(dbMock.putImageBlob).not.toHaveBeenCalled()
  })
})
