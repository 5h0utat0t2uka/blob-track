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
  velocity: Point
  missingFrames: number
  hits: number
  state: TrackState
  trail: Point[]
}

export type TrackingSettings = {
  motionThreshold: number
  backgroundLearningRate: number
  minBlobAreaRatio: number
  maxMissingFrames: number
  maxMatchDistanceRatio: number
  trailLength: number
  showTrail: boolean
}
