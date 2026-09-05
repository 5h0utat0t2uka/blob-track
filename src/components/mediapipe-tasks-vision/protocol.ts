import type { Detection } from '../shared/tracking/types.ts'
import type { DetectionCategory } from './config.ts'

export type DetectorWorkerRequest =
  | {
      type: 'init'
      generation: number
      modelUrl: string
      wasmRoot: string
      categories: readonly DetectionCategory[]
      scoreThreshold: number
    }
  | {
      type: 'configure'
      generation: number
      categories: readonly DetectionCategory[]
      scoreThreshold: number
    }
  | {
      type: 'frame'
      generation: number
      bitmap: ImageBitmap
      sourceWidth: number
      sourceHeight: number
      timestampMs: number
    }
  | { type: 'dispose' }

export type DetectorWorkerResponse =
  | { type: 'ready'; generation: number }
  | { type: 'configured'; generation: number }
  | {
      type: 'result'
      generation: number
      timestampMs: number
      width: number
      height: number
      detections: Detection[]
      inferenceTimeMs: number
    }
  | { type: 'error'; generation: number; message: string }
  | { type: 'disposed' }
