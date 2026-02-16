import { describe, expect, it } from 'vitest'
import { useDrawEditor } from './useDrawEditor'

function createEditorWithCanvas() {
  const editor = useDrawEditor()
  const container = document.createElement('div')
  document.body.appendChild(container)
  editor.mountCanvas(container)

  const canvas = container.querySelector('canvas') as HTMLCanvasElement
  if (!canvas) {
    throw new Error('canvas not mounted')
  }

  Object.defineProperty(canvas, 'clientWidth', { value: 300, configurable: true })
  Object.defineProperty(canvas, 'clientHeight', { value: 150, configurable: true })

  let rectState = {
    left: 0,
    top: 0,
    width: 300,
    height: 150,
  }

  canvas.getBoundingClientRect = () =>
    ({
      x: rectState.left,
      y: rectState.top,
      left: rectState.left,
      top: rectState.top,
      right: rectState.left + rectState.width,
      bottom: rectState.top + rectState.height,
      width: rectState.width,
      height: rectState.height,
      toJSON: () => ({}),
    }) as DOMRect

  function setRect(next: Partial<typeof rectState>) {
    rectState = { ...rectState, ...next }
  }

  return { editor, canvas, setRect }
}

function firePointerDown(canvas: HTMLCanvasElement, x: number, y: number, detail = 1) {
  const event = new MouseEvent('pointerdown', {
    clientX: x,
    clientY: y,
    button: 0,
    detail,
    bubbles: true,
  })

  Object.defineProperty(event, 'pointerType', {
    value: 'mouse',
    configurable: true,
  })

  canvas.dispatchEvent(event)
}

describe('useDrawEditor', () => {
  it('체크 상태 이벤트를 발행하고 clearMarks 시 비활성 상태로 돌아간다', async () => {
    const { editor, canvas } = createEditorWithCanvas()
    const events: Array<{ hasChecked: boolean; markCount: number }> = []

    const unsubscribe = editor.onMarkStateChange((payload) => {
      events.push(payload)
    })

    await editor.loadBaseImage('mock://test-image')
    firePointerDown(canvas, 120, 60)

    expect(editor.marks.value).toHaveLength(1)
    expect(events.at(-1)).toEqual({ hasChecked: true, markCount: 1 })

    editor.clearMarks()

    expect(editor.marks.value).toHaveLength(0)
    expect(events.at(-1)).toEqual({ hasChecked: false, markCount: 0 })

    unsubscribe()
    editor.unmountCanvas()
  })

  it('erase 모드에서 체크를 제거한다', async () => {
    const { editor, canvas } = createEditorWithCanvas()

    await editor.loadBaseImage('mock://test-image')

    firePointerDown(canvas, 120, 60)
    expect(editor.marks.value).toHaveLength(1)

    editor.setMode('erase')
    firePointerDown(canvas, 120, 60)

    expect(editor.marks.value).toHaveLength(0)
    editor.unmountCanvas()
  })

  it('상태 구독 해제 후에는 이벤트를 받지 않는다', async () => {
    const { editor, canvas } = createEditorWithCanvas()

    let called = 0
    const unsubscribe = editor.onMarkStateChange(() => {
      called += 1
    })

    await editor.loadBaseImage('mock://test-image')
    unsubscribe()

    firePointerDown(canvas, 120, 60)

    // 구독 해제 이후 추가 이벤트가 오지 않아야 한다.
    expect(called).toBe(2)
    editor.unmountCanvas()
  })

  it('확대 상태에서도 클릭 좌표가 캔버스 좌표로 정확히 변환된다', async () => {
    const { editor, canvas, setRect } = createEditorWithCanvas()
    await editor.loadBaseImage('mock://test-image')

    editor.setZoomScale(2)
    setRect({ width: 600, height: 300 })

    firePointerDown(canvas, 150, 75)

    expect(editor.marks.value).toHaveLength(1)
    const [mark] = editor.marks.value
    expect(mark.x).toBe(480)
    expect(mark.y).toBe(270)

    editor.unmountCanvas()
  })

  it('줌 범위를 변경하면 최소 1을 보장하고 현재 줌값도 클램프한다', async () => {
    const { editor } = createEditorWithCanvas()

    editor.setZoomRange(0.3, 0.8)
    expect(editor.minZoom.value).toBe(1)
    expect(editor.maxZoom.value).toBe(1)

    editor.setZoomRange(1, 3)
    editor.setZoomScale(2.6)
    expect(editor.zoomScale.value).toBe(2.6)

    editor.setZoomRange(1.2, 2.2)
    expect(editor.zoomScale.value).toBe(2.2)

    editor.unmountCanvas()
  })
})
