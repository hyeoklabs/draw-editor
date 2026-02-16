import { afterEach, vi } from 'vitest'

const mockContext2D = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
} satisfies Partial<CanvasRenderingContext2D>

class MockImage {
  // eslint-disable-next-line no-unused-vars
  onload: ((...args: unknown[]) => unknown) | null = null
  // eslint-disable-next-line no-unused-vars
  onerror: ((...args: unknown[]) => unknown) | null = null
  naturalWidth = 1920
  naturalHeight = 1080

  set src(_value: string) {
    queueMicrotask(() => {
      this.onload?.(new Event('load'))
    })
  }
}

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

vi.stubGlobal('Image', MockImage)
vi.stubGlobal('ResizeObserver', MockResizeObserver)

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
  () => mockContext2D as CanvasRenderingContext2D
)

vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type) {
  callback(new Blob(['mock'], { type: type ?? 'image/png' }))
})

if (!URL.createObjectURL) {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  })
} else {
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-url')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
}

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})
