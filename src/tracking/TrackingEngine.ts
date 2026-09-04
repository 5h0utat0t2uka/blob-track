import { OverlayRenderer } from '../rendering/OverlayRenderer.ts'
import { BlobTracker } from './BlobTracker.ts'
import { ConnectedComponents } from './ConnectedComponents.ts'
import { MotionDetector } from './MotionDetector.ts'
import type { TrackingSettings } from './types.ts'
import { MAX_FRAME_GAP_MS } from './timing.ts'

export type FrameResult = {
  trackCount: number
  detectionCount: number
  isCalibrating: boolean
  foregroundRatio: number
}

type AnalysisPipeline = {
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  motionDetector: MotionDetector
  connectedComponents: ConnectedComponents
  blobTracker: BlobTracker
}

const INITIAL_RESULT: FrameResult = {
  trackCount: 0,
  detectionCount: 0,
  isCalibrating: true,
  foregroundRatio: 0,
}

export function getAnalysisSize(sourceWidth: number, sourceHeight: number): {
  width: number
  height: number
} {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new RangeError('Invalid video dimensions.')
  }
  const scale = Math.min(1, 320 / Math.max(sourceWidth, sourceHeight))
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

export class TrackingEngine {
  private readonly analysisCanvas: HTMLCanvasElement
  private readonly analysisContext: CanvasRenderingContext2D
  private readonly overlayRenderer: OverlayRenderer
  private pipeline: AnalysisPipeline | null = null
  private previousTimestampMs: number | null = null
  private lastResult: FrameResult = INITIAL_RESULT

  constructor(
    analysisCanvas: HTMLCanvasElement,
    filterCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
  ) {
    this.analysisCanvas = analysisCanvas
    const analysisContext = analysisCanvas.getContext('2d', {
      willReadFrequently: true,
    })

    if (!analysisContext) {
      throw new Error('解析用Canvasを初期化できませんでした。')
    }

    this.analysisContext = analysisContext
    this.overlayRenderer = new OverlayRenderer(
      filterCanvas,
      overlayCanvas,
      1,
      1,
    )
  }

  resizeOverlay(width: number, height: number, pixelRatio: number): void {
    this.overlayRenderer.resize(width, height, pixelRatio)
  }

  reset(): void {
    this.pipeline?.motionDetector.reset()
    this.pipeline?.blobTracker.reset()
    this.overlayRenderer.clear()
    this.previousTimestampMs = null
    this.lastResult = INITIAL_RESULT
  }

  // Called on intrinsic video resize as well as before processing each frame.
  syncVideoSize(video: HTMLVideoElement): void {
    const { videoWidth: sourceWidth, videoHeight: sourceHeight } = video
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      this.pipeline = null
      this.reset()
      return
    }
    if (this.pipeline?.sourceWidth === sourceWidth && this.pipeline.sourceHeight === sourceHeight) {
      return
    }
    const { width, height } = getAnalysisSize(sourceWidth, sourceHeight)
    this.analysisCanvas.width = width
    this.analysisCanvas.height = height
    this.pipeline = {
      width,
      height,
      sourceWidth,
      sourceHeight,
      motionDetector: new MotionDetector(width, height),
      connectedComponents: new ConnectedComponents(width, height),
      blobTracker: new BlobTracker(width, height),
    }
    this.overlayRenderer.setAnalysisSize(width, height)
    this.reset()
  }

  process(video: HTMLVideoElement, timestampMs: number, settings: TrackingSettings): FrameResult {
    if (!Number.isFinite(timestampMs)) {
      throw new RangeError('Invalid frame timestamp.')
    }
    this.syncVideoSize(video)
    const pipeline = this.pipeline
    if (!pipeline) return this.lastResult

    if (timestampMs === this.previousTimestampMs) return this.lastResult
    if (this.previousTimestampMs !== null && (
      timestampMs < this.previousTimestampMs ||
      timestampMs - this.previousTimestampMs > MAX_FRAME_GAP_MS
    )) {
      this.reset()
    }
    const elapsedMs = this.previousTimestampMs === null ? 0 : timestampMs - this.previousTimestampMs
    this.previousTimestampMs = timestampMs
    this.analysisContext.drawImage(
      video,
      0,
      0,
      pipeline.width,
      pipeline.height,
    )
    const frame = this.analysisContext.getImageData(
      0,
      0,
      pipeline.width,
      pipeline.height,
    )
    const motion = pipeline.motionDetector.process(frame, elapsedMs, {
      threshold: settings.motionThreshold,
      backgroundTimeConstantMs: settings.backgroundTimeConstantMs,
    })

    if (motion.isCalibrating) {
      pipeline.blobTracker.reset()
      this.overlayRenderer.clear()
      this.lastResult = {
        trackCount: 0,
        detectionCount: 0,
        isCalibrating: true,
        foregroundRatio: motion.foregroundRatio,
      }
      return this.lastResult
    }

    const minimumArea = Math.max(
      1,
      Math.round(
        pipeline.width *
          pipeline.height *
          settings.minBlobAreaRatio,
      ),
    )
    const detections = pipeline.connectedComponents.extract(
      motion.mask,
      minimumArea,
    )
    const tracks = pipeline.blobTracker.update(detections, timestampMs, settings)
    this.overlayRenderer.render(tracks, video, settings.showTrail)

    this.lastResult = {
      trackCount: tracks.filter((track) => track.state === 'confirmed').length,
      detectionCount: detections.length,
      isCalibrating: false,
      foregroundRatio: motion.foregroundRatio,
    }
    return this.lastResult
  }
}
