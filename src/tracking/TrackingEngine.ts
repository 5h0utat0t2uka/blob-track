import { OverlayRenderer } from '../rendering/OverlayRenderer.ts'
import { BlobTracker } from './BlobTracker.ts'
import { ConnectedComponents } from './ConnectedComponents.ts'
import { MotionDetector } from './MotionDetector.ts'
import type { TrackingSettings } from './types.ts'

export type FrameResult = {
  trackCount: number
  detectionCount: number
  isCalibrating: boolean
  foregroundRatio: number
}

export class TrackingEngine {
  private readonly analysisWidth: number
  private readonly analysisHeight: number
  private readonly analysisContext: CanvasRenderingContext2D
  private readonly motionDetector: MotionDetector
  private readonly connectedComponents: ConnectedComponents
  private readonly blobTracker: BlobTracker
  private readonly overlayRenderer: OverlayRenderer

  constructor(
    analysisCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    analysisWidth = 320,
    analysisHeight = 180,
  ) {
    this.analysisWidth = analysisWidth
    this.analysisHeight = analysisHeight
    analysisCanvas.width = analysisWidth
    analysisCanvas.height = analysisHeight
    const analysisContext = analysisCanvas.getContext('2d', {
      willReadFrequently: true,
    })

    if (!analysisContext) {
      throw new Error('解析用Canvasを初期化できませんでした。')
    }

    this.analysisContext = analysisContext
    this.motionDetector = new MotionDetector(analysisWidth, analysisHeight)
    this.connectedComponents = new ConnectedComponents(
      analysisWidth,
      analysisHeight,
    )
    this.blobTracker = new BlobTracker(analysisWidth, analysisHeight)
    this.overlayRenderer = new OverlayRenderer(
      overlayCanvas,
      analysisWidth,
      analysisHeight,
    )
  }

  resizeOverlay(width: number, height: number, pixelRatio: number): void {
    this.overlayRenderer.resize(width, height, pixelRatio)
  }

  reset(): void {
    this.motionDetector.reset()
    this.blobTracker.reset()
    this.overlayRenderer.clear()
  }

  process(video: HTMLVideoElement, settings: TrackingSettings): FrameResult {
    this.analysisContext.drawImage(
      video,
      0,
      0,
      this.analysisWidth,
      this.analysisHeight,
    )
    const frame = this.analysisContext.getImageData(
      0,
      0,
      this.analysisWidth,
      this.analysisHeight,
    )
    const motion = this.motionDetector.process(frame, {
      threshold: settings.motionThreshold,
      backgroundLearningRate: settings.backgroundLearningRate,
    })

    if (motion.isCalibrating) {
      this.blobTracker.reset()
      this.overlayRenderer.clear()
      return {
        trackCount: 0,
        detectionCount: 0,
        isCalibrating: true,
        foregroundRatio: motion.foregroundRatio,
      }
    }

    const minimumArea = Math.max(
      1,
      Math.round(
        this.analysisWidth *
          this.analysisHeight *
          settings.minBlobAreaRatio,
      ),
    )
    const detections = this.connectedComponents.extract(
      motion.mask,
      minimumArea,
    )
    const tracks = this.blobTracker.update(detections, settings)
    this.overlayRenderer.render(
      tracks,
      video.videoWidth,
      video.videoHeight,
      settings.showTrail,
    )

    return {
      trackCount: tracks.filter((track) => track.state === 'confirmed').length,
      detectionCount: detections.length,
      isCalibrating: false,
      foregroundRatio: motion.foregroundRatio,
    }
  }
}
