export type EditorMode = 'check' | 'erase'
export type CheckShape = 'circle' | 'check' | 'dot'
export type OptimizeFormat = 'auto' | 'webp' | 'jpeg' | 'png'

export interface CheckMark {
  x: number
  y: number
  shape: CheckShape
  size?: number
  color?: string
}

export interface CanvasSession {
  baseImageSrc: string
  marks: CheckMark[]
  optimizedBlobKey: string
  optimizedMimeType: string
  optimizedFileName: string
  byteSize: number
  width: number
  height: number
  updatedAt: number
}
