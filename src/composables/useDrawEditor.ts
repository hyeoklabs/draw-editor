import { ref, type Ref } from 'vue'
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

export function useDrawEditor(canvasRef: Ref<HTMLCanvasElement | null>) {
  // options
  const mode = ref<EditorMode>('check')
  const shape = ref<CheckShape>('circle')
  const allowMulti = ref(true)
  const markSize = ref(18)
  const markColor = ref('#ef4444')

  // drawing
  const baseImage = ref<HTMLImageElement | null>(null)
  const baseImageSrc = ref('')
  const marks = ref<CheckMark[]>([])

  // set mode
  function setMode(nextMode: EditorMode) {
    mode.value = nextMode
  }

  // set shape
  function setShape(nextShape: CheckShape) {
    shape.value = nextShape
  }

  // allow multi
  function setAllowMulti(nextValue: boolean) {
    allowMulti.value = nextValue
  }

  function setMarkSize(nextSize: number) {
    markSize.value = Math.max(4, Math.min(100, Math.round(nextSize)))
  }

  function setMarkColor(nextColor: string) {
    markColor.value = nextColor
  }

  // load
  async function loadBaseImage(src: string) {
    const img = await loadImage(src)
    baseImage.value = img
    baseImageSrc.value = src
    marks.value = []
    setCanvasSize(img.naturalWidth, img.naturalHeight)
    render()
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = src
    })
  }

  function setCanvasSize(width: number, height: number) {
    const canvas = canvasRef.value
    if (!canvas) {
      return
    }

    canvas.width = width
    canvas.height = height
  }

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

  function getContext() {
    const canvas = canvasRef.value
    if (!canvas) {
      return null
    }

    return canvas.getContext('2d')
  }

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

  async function restore(payload: RestorePayload) {
    await loadBaseImage(payload.baseImageSrc)
    marks.value = payload.marks.map((item) => ({ ...item }))
    render()
  }

  async function renderSavedImage(savedOptimizedDataUrl: string) {
    await loadBaseImage(savedOptimizedDataUrl)
  }

  async function renderSavedBlob(savedBlob: Blob) {
    const objectUrl = URL.createObjectURL(savedBlob)
    try {
      await loadBaseImage(objectUrl)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  // 지우기 모드에서 클릭 위치 근처(반경 기준)의 마크만 삭제한다.
  function removeNearMark(x: number, y: number) {
    marks.value = marks.value.filter((mark) => {
      const eraseRadius = (mark.size ?? markSize.value) + 6
      const dx = mark.x - x
      const dy = mark.y - y
      return Math.sqrt(dx * dx + dy * dy) > eraseRadius
    })
  }

  // 클릭 좌표를 캔버스 픽셀 좌표로 변환해 check/erase 동작을 수행한다.
  function onCanvasClick(event: MouseEvent) {
    const canvas = canvasRef.value
    if (!canvas || !baseImage.value) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height

    if (mode.value === 'check') {
      // 단일 체크 모드에서는 기존 체크를 제거하고 마지막 클릭만 유지한다.
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

  // 체크만 초기화하고 원본 이미지는 유지한다.
  function clearMarks() {
    marks.value = []
    render()
  }

  function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality)
    })
  }

  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Failed to convert blob to dataUrl'))
      reader.readAsDataURL(blob)
    })
  }

  function buildFileName(ext: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `canvas-result-${stamp}.${ext}`
  }

  // DataURL -> File 변환 유틸.
  // 저장된 optimizedDataUrl을 서버 전송용 파일로 만들 때 사용한다.
  async function fileFromDataUrl(dataUrl: string, fileName = buildFileName('webp')) {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    return new File([blob], fileName, { type: blob.type || 'image/webp' })
  }

  // 저장된 이미지(DataURL)를 서버 업로드용 JPEG 파일로 변환한다.
  // 필요 시 maxWidth/maxHeight 기준으로 리사이즈해 전송 용량을 줄인다.
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

  // DataURL 다운로드 유틸.
  function downloadDataUrl(dataUrl: string, fileName = buildFileName('webp')) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = fileName
    a.click()
  }

  // File 다운로드 유틸.
  function downloadFile(file: File) {
    const objectUrl = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  // 완료 처리: 현재 편집 상태를 병합 + 최적화한 뒤
  // store 저장용 DataURL + 서버 전송용 File/Blob까지 함께 반환한다.
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

  // 현재 상태를 별도 캔버스에 병합 렌더링한다.
  // 원본 캔버스를 직접 압축하지 않고 오프스크린 캔버스를 사용한다.
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

  async function optimizePng(outputCanvas: HTMLCanvasElement): Promise<OptimizedAsset> {
    const blob = await canvasToBlob(outputCanvas, 'image/png', 1)
    if (!blob) {
      throw new Error('Failed to create PNG blob')
    }

    const dataUrl = await blobToDataUrl(blob)
    return { dataUrl, blob, mimeType: blob.type || 'image/png' }
  }

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

  return {
    mode,
    shape,
    allowMulti,
    markSize,
    markColor,
    marks,
    loadBaseImage,
    restore,
    renderSavedImage,
    renderSavedBlob,
    setMode,
    setShape,
    setAllowMulti,
    setMarkSize,
    setMarkColor,
    onCanvasClick,
    clearMarks,
    complete,
    fileFromDataUrl,
    fileFromDataUrlAsJpeg,
    fileFromBlobAsJpeg,
    downloadDataUrl,
    downloadFile,
  }
}
