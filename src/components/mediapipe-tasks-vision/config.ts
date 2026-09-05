export const DETECTION_CATEGORIES = [
  { value: 'person', label: '人物' },
  { value: 'car', label: '車' },
  { value: 'bicycle', label: '自転車' },
] as const

export type DetectionCategory = (typeof DETECTION_CATEGORIES)[number]['value']

export const DEFAULT_DETECTION_CATEGORIES: readonly DetectionCategory[] = ['person']
export const DEFAULT_SCORE_THRESHOLD = 0.7
export const DEFAULT_INFERENCE_FPS = 10
export const INFERENCE_FPS_OPTIONS = [5, 10, 15] as const
export const METRICS_REPORT_INTERVAL_MS = 500
export const TRACK_MISSING_TOLERANCE_MS = 800
// Preserve camera display quality; limit only the image sent for inference.
export const INFERENCE_LONG_EDGE = 640
export const INFERENCE_LONG_EDGES = [320, 480, 640] as const
export type InferenceLongEdge = (typeof INFERENCE_LONG_EDGES)[number]

export function isInferenceLongEdge(value: number): value is InferenceLongEdge {
  return INFERENCE_LONG_EDGES.some(edge => edge === value)
}

export function getInferenceSize(width: number, height: number, longEdge: InferenceLongEdge = INFERENCE_LONG_EDGE): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Invalid source dimensions.')
  }
  if (!isInferenceLongEdge(longEdge)) throw new RangeError('Invalid inference resolution.')
  const scale = Math.min(1, longEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const MODEL_PATH = 'mediapipe/models/efficientdet-lite0-int8-v1.tflite'
const WASM_PATH = 'mediapipe/wasm'

export function resolveMediaPipeAssetUrls(baseUrl: string, origin: string): {
  modelUrl: string
  wasmRoot: string
} {
  const base = new URL(baseUrl, origin)
  return {
    modelUrl: new URL(MODEL_PATH, base).href,
    wasmRoot: new URL(WASM_PATH, base).href.replace(/\/$/, ''),
  }
}

export function isDetectionCategory(value: string): value is DetectionCategory {
  return DETECTION_CATEGORIES.some((category) => category.value === value)
}
