import { ref } from 'vue'
import type { CheckMark, CheckShape, EditorMode, OptimizeFormat } from '../types/canvas'

interface RestorePayload {
  baseImageSrc: string
  marks: CheckMark[]
}

interface OptimizedAsset {
  dataUrl: string
  blob: Blob
  mimeType: string
}

interface CompleteOptions {
  format?: OptimizeFormat
}

interface JpegConvertOptions {
  fileName?: string
  quality?: number
  maxWidth?: number
  maxHeight?: number
}

export function useDrawEditor() {
  // ---------------------------------------------------------------------------
  // 1) 에디터 상태: 모드, 스타일, 줌, 팬
  // ---------------------------------------------------------------------------
  const mode = ref<EditorMode>('check')
  const shape = ref<CheckShape>('dot')
  const allowMulti = ref(true)
  const markSize = ref(18)
  const markColor = ref('#ef4444')

  const zoomScale = ref(1)
  const minZoom = ref(1)
  const maxZoom = ref(4)
  const panX = ref(0)
  const panY = ref(0)

  // 클릭/터치 직후 중복 입력을 잠시 차단하기 위한 타임스탬프
  const blockClickUntil = ref(0)

  // ---------------------------------------------------------------------------
  // 2) DOM/런타임 참조: 동적 캔버스와 옵저버
  // ---------------------------------------------------------------------------
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const containerRef = ref<HTMLDivElement | null>(null)
  const resizeObserverRef = ref<ResizeObserver | null>(null)

  // ---------------------------------------------------------------------------
  // 3) 드로잉 상태: 베이스 이미지 + 마크 + 제스처 진행 상태
  // ---------------------------------------------------------------------------
  const baseImage = ref<HTMLImageElement | null>(null)
  const baseImageSrc = ref('')
  const marks = ref<CheckMark[]>([])

  const pinchState = ref({
    initialDistance: 0,
    initialScale: 1,
    initialPanX: 0,
    initialPanY: 0,
    initialCenterX: 0,
    initialCenterY: 0,
    pinching: false,
    panning: false,
    panStartX: 0,
    panStartY: 0,
  })

  // ---------------------------------------------------------------------------
  // 4) 저수준 수학 유틸 (clamp, 경계, transform)
  // ---------------------------------------------------------------------------

  // 숫자를 [min, max] 범위로 고정한다.
  function clampValue(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
  }

  // 현재 설정된 min/max 줌 범위 안으로 스케일을 고정한다.
  function clampScale(nextScale: number) {
    return Math.max(minZoom.value, Math.min(maxZoom.value, Number(nextScale.toFixed(2))))
  }

  // 확대/축소 상태에서 캔버스가 래퍼 바깥으로 벗어나지 않도록 pan을 제한한다.
  function clampPanToBounds() {
    const canvas = canvasRef.value
    const container = containerRef.value

    if (!canvas || !container) {
      return
    }

    // 최소 줌에서는 원위치가 기본 상태다.
    if (zoomScale.value <= minZoom.value) {
      panX.value = 0
      panY.value = 0
      return
    }

    const baseWidth = canvas.clientWidth
    const baseHeight = canvas.clientHeight
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    if (!baseWidth || !baseHeight || !containerWidth || !containerHeight) {
      return
    }

    // 확대된 실제 표시 크기와 컨테이너 차이의 절반만큼만 이동 가능하다.
    const scaledWidth = baseWidth * zoomScale.value
    const scaledHeight = baseHeight * zoomScale.value
    const maxPanX = Math.max(0, (scaledWidth - containerWidth) / 2)
    const maxPanY = Math.max(0, (scaledHeight - containerHeight) / 2)

    panX.value = clampValue(panX.value, -maxPanX, maxPanX)
    panY.value = clampValue(panY.value, -maxPanY, maxPanY)
  }

  // pan/zoom 값을 실제 canvas CSS transform으로 반영한다.
  function syncCanvasTransform() {
    if (!canvasRef.value) {
      return
    }

    clampPanToBounds()
    canvasRef.value.style.transform = `translate(${panX.value}px, ${panY.value}px) scale(${zoomScale.value})`
  }

  // pinch 계산용: 두 손가락 중심점
  function getTouchCenter(event: TouchEvent) {
    const first = event.touches.item(0)
    const second = event.touches.item(1)

    if (!first || !second) {
      return { x: 0, y: 0 }
    }

    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    }
  }

  // pinch 계산용: 두 손가락 사이 거리
  function getTouchDistance(event: TouchEvent) {
    const first = event.touches.item(0)
    const second = event.touches.item(1)

    if (!first || !second) {
      return 0
    }

    const dx = second.clientX - first.clientX
    const dy = second.clientY - first.clientY

    return Math.sqrt(dx * dx + dy * dy)
  }

  // 포인터 기준 확대/축소: 마우스/터치 중심점을 기준으로 자연스럽게 줌한다.
  function zoomAt(clientX: number, clientY: number, nextScale: number) {
    const canvas = canvasRef.value
    if (!canvas) {
      return
    }

    const prevScale = zoomScale.value
    const clamped = clampScale(nextScale)
    if (clamped === prevScale) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // 화면 기준 포인터 위치가 확대 후에도 같은 지점을 가리키도록 pan을 보정한다.
    const pointX = clientX - centerX
    const pointY = clientY - centerY
    const ratio = clamped / prevScale

    panX.value = (1 - ratio) * pointX + ratio * panX.value
    panY.value = (1 - ratio) * pointY + ratio * panY.value
    zoomScale.value = clamped

    if (zoomScale.value <= minZoom.value) {
      panX.value = 0
      panY.value = 0
    }

    syncCanvasTransform()
  }

  // ---------------------------------------------------------------------------
  // 5) 마운트/언마운트 프로세스: 캔버스 생성 및 네이티브 이벤트 바인딩
  // ---------------------------------------------------------------------------

  // canvas-wrap 내부에 canvas를 동적으로 생성하고 이벤트를 등록한다.
  function mountCanvas(container: HTMLDivElement) {
    unmountCanvas()

    const canvas = document.createElement('canvas')
    canvas.className = 'editor-canvas'
    canvas.style.width = 'auto'
    canvas.style.height = 'auto'
    canvas.style.maxWidth = '100%'
    canvas.style.maxHeight = '100%'
    canvas.style.display = 'block'
    canvas.style.cursor = 'crosshair'
    canvas.style.borderRadius = '8px'
    canvas.style.transformOrigin = 'center center'
    canvas.style.touchAction = 'none'

    // 입력 이벤트를 canvas 자체에 직접 연결한다.
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('dblclick', onDoubleClick)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    container.innerHTML = ''
    container.appendChild(canvas)

    containerRef.value = container
    canvasRef.value = canvas

    // 컨테이너 리사이즈 시 pan/zoom을 다시 경계에 맞춘다.
    resizeObserverRef.value = new ResizeObserver(() => {
      syncCanvasTransform()
    })
    resizeObserverRef.value.observe(container)

    syncCanvasTransform()

    // 이미 로드된 이미지가 있다면 새 canvas에 즉시 복원한다.
    if (baseImage.value) {
      setCanvasSize(baseImage.value.naturalWidth, baseImage.value.naturalHeight)
      render()
    }
  }

  // 이벤트/타이머/DOM을 해제해 메모리 누수를 방지한다.
  function unmountCanvas() {
    resizeObserverRef.value?.disconnect()
    resizeObserverRef.value = null

    const canvas = canvasRef.value
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('dblclick', onDoubleClick)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('touchcancel', onTouchEnd)
      canvas.remove()
    }

    canvasRef.value = null
    containerRef.value = null
  }

  // ---------------------------------------------------------------------------
  // 6) 옵션 설정 함수: 모드, 마커 스타일, 줌 범위
  // ---------------------------------------------------------------------------

  function setMode(nextMode: EditorMode) {
    mode.value = nextMode
  }

  function setShape(nextShape: CheckShape) {
    shape.value = nextShape
  }

  function setAllowMulti(nextValue: boolean) {
    allowMulti.value = nextValue
  }

  function setMarkSize(nextSize: number) {
    // 너무 작거나 큰 값이 들어오지 않도록 제한한다.
    markSize.value = Math.max(4, Math.min(100, Math.round(nextSize)))
  }

  function setMarkColor(nextColor: string) {
    markColor.value = nextColor
  }

  function setZoomRange(nextMin: number, nextMax: number) {
    // 원본보다 작게는 축소하지 않기 위해 최소값은 1 이상으로 강제한다.
    const safeMin = Math.max(1, Number(nextMin.toFixed(2)))
    const safeMax = Math.max(safeMin, Number(nextMax.toFixed(2)))

    minZoom.value = safeMin
    maxZoom.value = safeMax

    // 범위 변경 직후 현재 줌값도 새 범위에 맞춰 보정한다.
    setZoomScale(zoomScale.value)
  }

  function setZoomScale(nextScale: number) {
    zoomScale.value = clampScale(nextScale)

    if (zoomScale.value <= minZoom.value) {
      panX.value = 0
      panY.value = 0
    }

    syncCanvasTransform()
  }

  function resetZoom() {
    zoomScale.value = minZoom.value
    panX.value = 0
    panY.value = 0
    syncCanvasTransform()
  }

  // ---------------------------------------------------------------------------
  // 7) 이미지 로딩 및 렌더링 프로세스
  // ---------------------------------------------------------------------------

  // 외부 이미지 소스를 에디터의 베이스 이미지로 로드한다.
  async function loadBaseImage(src: string) {
    const img = await loadImage(src)

    baseImage.value = img
    baseImageSrc.value = src
    marks.value = []

    // 실제 이미지 해상도(원본 픽셀)를 캔버스 내부 버퍼 크기로 사용한다.
    setCanvasSize(img.naturalWidth, img.naturalHeight)
    render()
  }

  // 문자열 URL/데이터URL/blob URL을 Image 객체로 로딩한다.
  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = src
    })
  }

  // 캔버스 내부 비트맵 버퍼 크기를 설정한다.
  function setCanvasSize(width: number, height: number) {
    const canvas = canvasRef.value
    if (!canvas) {
      return
    }

    canvas.width = width
    canvas.height = height
  }

  // 현재 상태(베이스 이미지 + 마크)를 캔버스에 다시 그린다.
  function render() {
    const canvas = canvasRef.value
    const ctx = getContext()

    if (!canvas || !ctx || !baseImage.value) {
      return
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(baseImage.value, 0, 0, canvas.width, canvas.height)

    for (const mark of marks.value) {
      drawMark(ctx, mark)
    }
  }

  // 2D context를 안전하게 가져온다.
  function getContext() {
    const canvas = canvasRef.value
    if (!canvas) {
      return null
    }

    return canvas.getContext('2d')
  }

  // mark 타입(dot/circle/check)에 따라 캔버스에 도형을 그린다.
  function drawMark(ctx: CanvasRenderingContext2D, mark: CheckMark) {
    const size = mark.size ?? markSize.value
    const color = mark.color ?? markColor.value

    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = Math.max(2, Math.round(size * 0.25))

    if (mark.shape === 'circle') {
      ctx.beginPath()
      ctx.arc(mark.x, mark.y, size, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (mark.shape === 'dot') {
      ctx.beginPath()
      ctx.arc(mark.x, mark.y, Math.max(2, Math.round(size * 0.5)), 0, Math.PI * 2)
      ctx.fill()
    }

    if (mark.shape === 'check') {
      ctx.beginPath()
      ctx.moveTo(mark.x - size * 0.65, mark.y)
      ctx.lineTo(mark.x - size * 0.1, mark.y + size * 0.6)
      ctx.lineTo(mark.x + size * 0.9, mark.y - size * 0.8)
      ctx.stroke()
    }

    ctx.restore()
  }

  // 저장된 편집 상태(base + marks)를 그대로 복원한다.
  async function restore(payload: RestorePayload) {
    await loadBaseImage(payload.baseImageSrc)
    marks.value = payload.marks.map((item) => ({ ...item }))
    render()
  }

  // 저장된 DataURL 이미지를 base image로 다시 렌더링한다.
  async function renderSavedImage(savedOptimizedDataUrl: string) {
    await loadBaseImage(savedOptimizedDataUrl)
  }

  // 저장된 Blob 이미지를 object URL로 임시 로드 후 렌더링한다.
  async function renderSavedBlob(savedBlob: Blob) {
    const objectUrl = URL.createObjectURL(savedBlob)

    try {
      await loadBaseImage(objectUrl)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  // ---------------------------------------------------------------------------
  // 8) 마크 편집 프로세스 (체크/지우기)
  // ---------------------------------------------------------------------------

  // 지우기 모드: 클릭 지점 반경 안의 마크만 제거한다.
  function removeNearMark(x: number, y: number) {
    marks.value = marks.value.filter((mark) => {
      const eraseRadius = (mark.size ?? markSize.value) + 6
      const dx = mark.x - x
      const dy = mark.y - y
      return Math.sqrt(dx * dx + dy * dy) > eraseRadius
    })
  }

  // 화면 좌표(clientX/Y)를 캔버스 픽셀 좌표로 변환한 뒤 체크/지우기를 실행한다.
  function applyMarkOrErase(clientX: number, clientY: number) {
    const canvas = canvasRef.value

    if (
      !canvas ||
      !baseImage.value ||
      pinchState.value.pinching ||
      Date.now() < blockClickUntil.value
    ) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * canvas.width
    const y = ((clientY - rect.top) / rect.height) * canvas.height

    if (mode.value === 'check') {
      // 단일 모드에서는 기존 마크를 비우고 마지막 한 개만 유지한다.
      if (!allowMulti.value) {
        marks.value = []
      }

      marks.value.push({
        x,
        y,
        shape: shape.value,
        size: markSize.value,
        color: markColor.value,
      })
    }

    if (mode.value === 'erase') {
      removeNearMark(x, y)
    }

    render()
  }

  // ---------------------------------------------------------------------------
  // 9) 입력 이벤트 프로세스: 포인터, 터치, 휠, 더블클릭
  // ---------------------------------------------------------------------------

  // 마우스/펜 계열 입력: click 누락 이슈를 피하기 위해 pointerdown 기준으로 처리한다.
  function onPointerDown(event: PointerEvent) {
    // 터치는 별도 onTouch* 흐름에서 처리한다.
    if (event.pointerType === 'touch' || event.button !== 0) {
      return
    }

    // 더블클릭 두 번째 입력은 마크 추가를 막고, 확대/축소만 수행한다.
    if (event.detail > 1) {
      return
    }

    applyMarkOrErase(event.clientX, event.clientY)
  }

  // 터치 시작: pinch 시작점/단일 pan 시작점을 기록한다.
  function onTouchStart(event: TouchEvent) {
    event.preventDefault()

    if (event.touches.length >= 2) {
      const distance = getTouchDistance(event)
      if (distance <= 0) {
        return
      }

      const center = getTouchCenter(event)
      pinchState.value.pinching = true
      pinchState.value.panning = false
      pinchState.value.initialDistance = distance
      pinchState.value.initialScale = zoomScale.value
      pinchState.value.initialPanX = panX.value
      pinchState.value.initialPanY = panY.value
      pinchState.value.initialCenterX = center.x
      pinchState.value.initialCenterY = center.y
      return
    }

    if (event.touches.length !== 1 || zoomScale.value <= minZoom.value) {
      return
    }

    const touch = event.touches.item(0)
    if (!touch) {
      return
    }

    pinchState.value.panning = false
    pinchState.value.pinching = false
    pinchState.value.panStartX = touch.clientX
    pinchState.value.panStartY = touch.clientY
    pinchState.value.initialPanX = panX.value
    pinchState.value.initialPanY = panY.value
  }

  // 터치 이동: pinch 확대/축소 또는 1손가락 pan을 처리한다.
  function onTouchMove(event: TouchEvent) {
    event.preventDefault()

    if (pinchState.value.pinching && event.touches.length >= 2) {
      const currentDistance = getTouchDistance(event)
      if (currentDistance <= 0 || pinchState.value.initialDistance <= 0) {
        return
      }

      const ratio = currentDistance / pinchState.value.initialDistance
      const center = getTouchCenter(event)

      // 먼저 중심점 기준으로 확대/축소를 적용한다.
      zoomAt(center.x, center.y, pinchState.value.initialScale * ratio)

      // pinch 중 손가락 중심 자체가 이동한 거리만큼 pan을 추가 반영한다.
      panX.value = pinchState.value.initialPanX + (center.x - pinchState.value.initialCenterX)
      panY.value = pinchState.value.initialPanY + (center.y - pinchState.value.initialCenterY)
      syncCanvasTransform()
      return
    }

    if (event.touches.length === 1 && zoomScale.value > minZoom.value) {
      const touch = event.touches.item(0)
      if (!touch) {
        return
      }

      const dx = touch.clientX - pinchState.value.panStartX
      const dy = touch.clientY - pinchState.value.panStartY
      const movedEnough = Math.sqrt(dx * dx + dy * dy) >= 4

      // 클릭 의도로 시작한 터치를 pan으로 오인하지 않도록 최소 이동 임계값을 둔다.
      if (!pinchState.value.panning && !movedEnough) {
        return
      }

      pinchState.value.panning = true
      panX.value = pinchState.value.initialPanX + dx
      panY.value = pinchState.value.initialPanY + dy
      syncCanvasTransform()
    }
  }

  // 터치 종료: 단일 탭 체크와 pinch/pan 종료 처리를 담당한다.
  function onTouchEnd(event: TouchEvent) {
    event.preventDefault()

    const now = Date.now()
    const changed = event.changedTouches?.[0]
    const hasChangedTouch = Boolean(changed)
    const wasPinchingOrPanning = pinchState.value.pinching || pinchState.value.panning

    // 단일 탭은 지연 없이 바로 체크/지우기를 수행한다.
    if (!wasPinchingOrPanning && event.touches.length === 0 && hasChangedTouch) {
      applyMarkOrErase(changed.clientX, changed.clientY)
      return
    }

    // pinch/pan 종료 시 상태를 정리한다.
    if (!pinchState.value.pinching && !pinchState.value.panning) {
      return
    }

    blockClickUntil.value = now + 350
    pinchState.value.pinching = false
    pinchState.value.panning = false
    pinchState.value.initialDistance = 0
    pinchState.value.initialScale = zoomScale.value
    pinchState.value.initialPanX = panX.value
    pinchState.value.initialPanY = panY.value
  }

  // 마우스 더블클릭: 확대/축소 토글
  function onDoubleClick(event: MouseEvent) {
    const zoomStep = Math.max(2, Number((minZoom.value * 2).toFixed(2)))
    const targetScale = zoomScale.value > minZoom.value + 0.2 ? minZoom.value : zoomStep
    zoomAt(event.clientX, event.clientY, targetScale)
    blockClickUntil.value = Date.now() + 250
  }

  // 휠/트랙패드 입력: 포인터 위치를 기준으로 연속 확대/축소
  function onWheel(event: WheelEvent) {
    event.preventDefault()

    const lineHeight = 16
    const pageHeight = window.innerHeight || 800
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? lineHeight
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? pageHeight
          : 1

    const delta = event.deltaY * unit
    const sensitivity = event.ctrlKey ? 0.0035 : 0.0016
    const factor = Math.exp(-delta * sensitivity)

    zoomAt(event.clientX, event.clientY, zoomScale.value * factor)
    blockClickUntil.value = Date.now() + 120
  }

  // 마크만 초기화하고 베이스 이미지는 유지한다.
  function clearMarks() {
    marks.value = []
    render()
  }

  // ---------------------------------------------------------------------------
  // 10) 내보내기/변환 유틸
  // ---------------------------------------------------------------------------

  // 캔버스 -> blob 변환 유틸
  function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality)
    })
  }

  // blob -> dataURL 변환 유틸
  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Failed to convert blob to dataUrl'))
      reader.readAsDataURL(blob)
    })
  }

  // 출력 파일명 생성 유틸
  function buildFileName(ext: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `canvas-result-${stamp}.${ext}`
  }

  // DataURL -> File 변환
  async function fileFromDataUrl(dataUrl: string, fileName = buildFileName('webp')) {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    return new File([blob], fileName, { type: blob.type || 'image/webp' })
  }

  // DataURL 이미지를 업로드용 JPEG 파일로 변환 (필요 시 리사이즈 포함)
  async function fileFromDataUrlAsJpeg(
    dataUrl: string,
    options: JpegConvertOptions = {}
  ): Promise<File> {
    const sourceImage = await loadImage(dataUrl)
    const maxWidth = options.maxWidth ?? 1920
    const maxHeight = options.maxHeight ?? 1080
    const quality = options.quality ?? 0.82

    const ratio = Math.min(
      maxWidth / sourceImage.naturalWidth,
      maxHeight / sourceImage.naturalHeight,
      1
    )

    const targetWidth = Math.round(sourceImage.naturalWidth * ratio)
    const targetHeight = Math.round(sourceImage.naturalHeight * ratio)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to create 2D context for jpeg conversion')
    }

    ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight)

    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (!blob) {
      throw new Error('Failed to convert image to jpeg blob')
    }

    const fileName = options.fileName ?? buildFileName('jpg')
    return new File([blob], fileName, { type: 'image/jpeg' })
  }

  // Blob 이미지를 임시 object URL로 읽어 JPEG 파일로 변환
  async function fileFromBlobAsJpeg(
    sourceBlob: Blob,
    options: JpegConvertOptions = {}
  ): Promise<File> {
    const objectUrl = URL.createObjectURL(sourceBlob)

    try {
      return await fileFromDataUrlAsJpeg(objectUrl, options)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  // dataURL 직접 다운로드
  function downloadDataUrl(dataUrl: string, fileName = buildFileName('webp')) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = fileName
    a.click()
  }

  // 파일 객체 다운로드
  function downloadFile(file: File) {
    const objectUrl = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  // ---------------------------------------------------------------------------
  // 11) 완료 처리 및 최적화 프로세스
  // ---------------------------------------------------------------------------

  // 현재 상태를 병합해 최적화 자산 + 메타데이터를 반환한다.
  async function complete(options: CompleteOptions = {}) {
    const outputCanvas = drawMergedToCanvas()
    if (!outputCanvas) {
      return null
    }

    const optimizedAsset = await optimizeCanvas(outputCanvas, options)
    const ext = optimizedAsset.mimeType.split('/')[1] ?? 'jpg'
    const fileName = buildFileName(ext)

    const optimizedFile = new File([optimizedAsset.blob], fileName, {
      type: optimizedAsset.mimeType,
    })

    return {
      optimizedAsset,
      baseImageSrc: baseImageSrc.value,
      marks: marks.value.map((item) => ({ ...item })),
      optimizedDataUrl: optimizedAsset.dataUrl,
      optimizedBlob: optimizedAsset.blob,
      optimizedFile,
      optimizedMimeType: optimizedAsset.mimeType,
      optimizedFileName: fileName,
      byteSize: optimizedAsset.blob.size,
      width: outputCanvas.width,
      height: outputCanvas.height,
    }
  }

  // 현재 화면 상태(base + marks)를 별도 오프스크린 캔버스로 병합한다.
  function drawMergedToCanvas() {
    const outputCanvas = document.createElement('canvas')
    const ctx = outputCanvas.getContext('2d')
    const sourceCanvas = canvasRef.value

    if (!sourceCanvas || !ctx || !baseImage.value) {
      return null
    }

    outputCanvas.width = sourceCanvas.width
    outputCanvas.height = sourceCanvas.height
    ctx.drawImage(baseImage.value, 0, 0, outputCanvas.width, outputCanvas.height)

    for (const mark of marks.value) {
      drawMark(ctx, mark)
    }

    return outputCanvas
  }

  // 손실 압축(webp/jpeg): 품질을 내려가며 목표 용량(maxBytes) 충족 시 조기 종료
  async function optimizeLossy(
    outputCanvas: HTMLCanvasElement,
    mimeType: 'image/webp' | 'image/jpeg'
  ): Promise<OptimizedAsset | null> {
    const maxBytes = 256 * 1024
    const qualityStart = 1.0
    const qualityMin = 0.5
    const qualityStep = 0.05

    let bestBlob: Blob | null = null

    for (let q = qualityStart; q >= qualityMin; q -= qualityStep) {
      const trial = await canvasToBlob(outputCanvas, mimeType, Number(q.toFixed(2)))
      if (!trial) {
        continue
      }

      bestBlob = trial

      if (trial.size <= maxBytes) {
        const dataUrl = await blobToDataUrl(trial)
        return { dataUrl, blob: trial, mimeType: trial.type || mimeType }
      }
    }

    if (!bestBlob) {
      return null
    }

    const dataUrl = await blobToDataUrl(bestBlob)
    return { dataUrl, blob: bestBlob, mimeType: bestBlob.type || mimeType }
  }

  // PNG 최적화: 무손실 출력
  async function optimizePng(outputCanvas: HTMLCanvasElement): Promise<OptimizedAsset> {
    const blob = await canvasToBlob(outputCanvas, 'image/png', 1)
    if (!blob) {
      throw new Error('Failed to create PNG blob')
    }

    const dataUrl = await blobToDataUrl(blob)
    return { dataUrl, blob, mimeType: blob.type || 'image/png' }
  }

  // 출력 포맷 옵션에 맞춰 최적화 분기를 수행한다.
  async function optimizeCanvas(
    outputCanvas: HTMLCanvasElement,
    options: CompleteOptions = {}
  ): Promise<OptimizedAsset> {
    const format = options.format ?? 'jpeg'

    if (format === 'png') {
      return optimizePng(outputCanvas)
    }

    if (format === 'webp') {
      const asset = await optimizeLossy(outputCanvas, 'image/webp')
      if (!asset) {
        throw new Error('Failed to optimize in webp format')
      }
      return asset
    }

    if (format === 'jpeg') {
      const asset = await optimizeLossy(outputCanvas, 'image/jpeg')
      if (!asset) {
        throw new Error('Failed to optimize in jpeg format')
      }
      return asset
    }

    throw new Error(`Failed to optimize in ${format} format`)
  }

  // ---------------------------------------------------------------------------
  // 공개 API
  // ---------------------------------------------------------------------------
  return {
    // 상태
    mode,
    shape,
    allowMulti,
    markSize,
    markColor,
    zoomScale,
    minZoom,
    maxZoom,
    panX,
    panY,
    marks,

    // 생명주기
    mountCanvas,
    unmountCanvas,

    // 이미지 흐름
    loadBaseImage,
    restore,
    renderSavedImage,
    renderSavedBlob,

    // 옵션
    setMode,
    setShape,
    setAllowMulti,
    setMarkSize,
    setMarkColor,
    setZoomRange,
    setZoomScale,
    resetZoom,

    // 편집
    clearMarks,

    // 완료/내보내기
    complete,
    fileFromDataUrl,
    fileFromDataUrlAsJpeg,
    fileFromBlobAsJpeg,
    downloadDataUrl,
    downloadFile,
  }
}
