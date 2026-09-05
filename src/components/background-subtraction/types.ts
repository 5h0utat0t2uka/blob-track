import type { TrackerSettings } from '../shared/tracking/types.ts'

export type BackgroundDetectionSettings = {
  motionThreshold: number
  backgroundTimeConstantMs: number
  minBlobAreaRatio: number
}

export type RenderSettings = {
  showTrail: boolean
  showGrayscale?: boolean
}

export type TrackingSettings = TrackerSettings & BackgroundDetectionSettings & RenderSettings
