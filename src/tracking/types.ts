export type Point = {
  x: number
  y: number
}

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type Detection = {
  bbox: Rect
  center: Point
  area: number
}

export type TrackState = 'tentative' | 'confirmed' | 'lost'

export type Track = {
  id: number
  bbox: Rect
  center: Point
  /** Filtered observed velocity in analysis pixels per second. */
  velocity: Point
  lastObservedCenter: Point
  lastObservedBox: Rect
  lastObservedAtMs: number
  hits: number
  state: TrackState
  trail: (Point & { timestampMs: number })[]
}

export type TrackingSettings = {
  motionThreshold: number
  backgroundTimeConstantMs: number
  minBlobAreaRatio: number
  maxMissingDurationMs: number
  maxMatchDistanceRatio: number
  trailDurationMs: number
  showTrail: boolean
}
