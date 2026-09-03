import type { Detection, Rect, Track, TrackingSettings } from './types.ts'

type MatchCandidate = {
  trackIndex: number
  detectionIndex: number
  cost: number
}

export class BlobTracker {
  private readonly width: number
  private readonly height: number
  private tracks: Track[] = []
  private nextId = 1

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  reset(): void {
    this.tracks = []
    this.nextId = 1
  }

  update(
    detections: readonly Detection[],
    settings: TrackingSettings,
  ): readonly Track[] {
    const diagonal = Math.hypot(this.width, this.height)
    const baseMaxDistance = diagonal * settings.maxMatchDistanceRatio
    const candidates: MatchCandidate[] = []

    for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex += 1) {
      const track = this.tracks[trackIndex]
      const predictedX = track.center.x + track.velocity.x
      const predictedY = track.center.y + track.velocity.y
      const predictedBox = {
        ...track.bbox,
        x: track.bbox.x + track.velocity.x,
        y: track.bbox.y + track.velocity.y,
      }
      const maxDistance =
        baseMaxDistance * (1 + Math.min(track.missingFrames, 4) * 0.25)

      for (
        let detectionIndex = 0;
        detectionIndex < detections.length;
        detectionIndex += 1
      ) {
        const detection = detections[detectionIndex]
        const distance = Math.hypot(
          detection.center.x - predictedX,
          detection.center.y - predictedY,
        )

        if (distance > maxDistance) {
          continue
        }

        const overlap = intersectionOverUnion(predictedBox, detection.bbox)
        const cost = distance / maxDistance + (1 - overlap) * 0.35

        if (cost <= 1.25) {
          candidates.push({ trackIndex, detectionIndex, cost })
        }
      }
    }

    candidates.sort((left, right) => left.cost - right.cost)
    const matchedTrackIndexes = new Set<number>()
    const matchedDetectionIndexes = new Set<number>()

    for (const candidate of candidates) {
      if (
        matchedTrackIndexes.has(candidate.trackIndex) ||
        matchedDetectionIndexes.has(candidate.detectionIndex)
      ) {
        continue
      }

      this.updateMatchedTrack(
        this.tracks[candidate.trackIndex],
        detections[candidate.detectionIndex],
        settings.trailLength,
      )
      matchedTrackIndexes.add(candidate.trackIndex)
      matchedDetectionIndexes.add(candidate.detectionIndex)
    }

    for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex += 1) {
      if (matchedTrackIndexes.has(trackIndex)) {
        continue
      }

      const track = this.tracks[trackIndex]
      track.missingFrames += 1

      if (track.state === 'tentative') {
        continue
      }

      track.state = 'lost'
      track.center.x += track.velocity.x
      track.center.y += track.velocity.y
      track.bbox.x += track.velocity.x
      track.bbox.y += track.velocity.y
      track.velocity.x *= 0.9
      track.velocity.y *= 0.9
    }

    this.tracks = this.tracks.filter(
      (track) =>
        track.state !== 'tentative' || track.missingFrames === 0,
    )
    this.tracks = this.tracks.filter(
      (track) => track.missingFrames <= settings.maxMissingFrames,
    )

    for (
      let detectionIndex = 0;
      detectionIndex < detections.length;
      detectionIndex += 1
    ) {
      if (!matchedDetectionIndexes.has(detectionIndex)) {
        this.tracks.push(this.createTrack(detections[detectionIndex]))
      }
    }

    return this.tracks.filter((track) => track.state !== 'tentative')
  }

  private createTrack(detection: Detection): Track {
    const track: Track = {
      id: this.nextId,
      bbox: { ...detection.bbox },
      center: { ...detection.center },
      velocity: { x: 0, y: 0 },
      missingFrames: 0,
      hits: 1,
      state: 'tentative',
      trail: [{ ...detection.center }],
    }
    this.nextId += 1
    return track
  }

  private updateMatchedTrack(
    track: Track,
    detection: Detection,
    trailLength: number,
  ): void {
    const measuredVelocityX = detection.center.x - track.center.x
    const measuredVelocityY = detection.center.y - track.center.y

    track.velocity.x = track.velocity.x * 0.6 + measuredVelocityX * 0.4
    track.velocity.y = track.velocity.y * 0.6 + measuredVelocityY * 0.4
    track.bbox = { ...detection.bbox }
    track.center = { ...detection.center }
    track.missingFrames = 0
    track.hits += 1
    track.state = track.hits >= 2 ? 'confirmed' : 'tentative'
    track.trail.push({ ...detection.center })

    if (track.trail.length > trailLength) {
      track.trail.splice(0, track.trail.length - trailLength)
    }
  }
}

function intersectionOverUnion(left: Rect, right: Rect): number {
  const intersectionLeft = Math.max(left.x, right.x)
  const intersectionTop = Math.max(left.y, right.y)
  const intersectionRight = Math.min(
    left.x + left.width,
    right.x + right.width,
  )
  const intersectionBottom = Math.min(
    left.y + left.height,
    right.y + right.height,
  )
  const intersectionWidth = Math.max(0, intersectionRight - intersectionLeft)
  const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop)
  const intersectionArea = intersectionWidth * intersectionHeight

  if (intersectionArea === 0) {
    return 0
  }

  const unionArea =
    left.width * left.height +
    right.width * right.height -
    intersectionArea
  return intersectionArea / unionArea
}
