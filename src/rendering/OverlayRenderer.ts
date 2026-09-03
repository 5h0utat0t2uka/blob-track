import type { Point, Rect, Track } from '../tracking/types.ts'

type CoverTransform = {
  renderWidth: number
  renderHeight: number
  offsetX: number
  offsetY: number
}

export class OverlayRenderer {
  private readonly filterContext: CanvasRenderingContext2D
  private readonly filterCanvas: HTMLCanvasElement
  private readonly overlayContext: CanvasRenderingContext2D
  private readonly overlayCanvas: HTMLCanvasElement
  private readonly analysisWidth: number
  private readonly analysisHeight: number
  private cssWidth = 1
  private cssHeight = 1

  constructor(
    filterCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    analysisWidth: number,
    analysisHeight: number,
  ) {
    const filterContext = filterCanvas.getContext('2d')
    const overlayContext = overlayCanvas.getContext('2d')
    if (!filterContext || !overlayContext) {
      throw new Error('Failed to get 2D contexts from canvases.')
    }
    this.filterCanvas = filterCanvas
    this.filterContext = filterContext
    this.overlayCanvas = overlayCanvas
    this.overlayContext = overlayContext
    this.analysisWidth = analysisWidth
    this.analysisHeight = analysisHeight
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const safeWidth = Math.max(1, cssWidth)
    const safeHeight = Math.max(1, cssHeight)
    const pixelRatio = Math.min(Math.max(1, devicePixelRatio), 2)
    const renderWidth = Math.round(safeWidth * pixelRatio)
    const renderHeight = Math.round(safeHeight * pixelRatio)
    this.cssWidth = safeWidth
    this.cssHeight = safeHeight

    for (const canvas of [this.filterCanvas, this.overlayCanvas]) {
      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth
        canvas.height = renderHeight
      }
    }
    this.filterContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    this.overlayContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  }

  clear(): void {
    this.filterContext.clearRect(0, 0, this.cssWidth, this.cssHeight)
    this.overlayContext.clearRect(0, 0, this.cssWidth, this.cssHeight)
  }

  render(
    tracks: readonly Track[],
    video: HTMLVideoElement,
    showTrail: boolean,
  ): void {
    this.clear()
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return
    }

    const transform = this.createCoverTransform(sourceWidth, sourceHeight)
    for (const track of tracks) {
      if (track.state === 'confirmed') {
        this.drawGrayscaleRegion(video, track.bbox, transform)
      }
    }

    for (const track of tracks) {
      this.drawTrack(track, transform, showTrail)
    }
  }

  private createCoverTransform(sourceWidth: number, sourceHeight: number): CoverTransform {
    const scale = Math.max(this.cssWidth / sourceWidth, this.cssHeight / sourceHeight)
    const renderWidth = sourceWidth * scale
    const renderHeight = sourceHeight * scale
    return {
      renderWidth,
      renderHeight,
      offsetX: (this.cssWidth - renderWidth) / 2,
      offsetY: (this.cssHeight - renderHeight) / 2,
    }
  }

  private drawGrayscaleRegion(
    video: HTMLVideoElement,
    source: Rect,
    transform: CoverTransform,
  ): void {
    const destination = this.mapRect(source, transform)
    if (source.width <= 0 || source.height <= 0) {
      return
    }

    const sourceX = (source.x / this.analysisWidth) * video.videoWidth
    const sourceY = (source.y / this.analysisHeight) * video.videoHeight
    const sourceWidth = (source.width / this.analysisWidth) * video.videoWidth
    const sourceHeight =
      (source.height / this.analysisHeight) * video.videoHeight

    this.filterContext.save()
    this.filterContext.beginPath()
    this.filterContext.rect(
      destination.x,
      destination.y,
      destination.width,
      destination.height,
    )
    this.filterContext.clip()
    this.filterContext.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destination.x,
      destination.y,
      destination.width,
      destination.height,
    )
    this.filterContext.restore()
  }

  private drawTrack(track: Track, transform: CoverTransform, showTrail: boolean): void {
    const context = this.overlayContext
    const hue = (track.id * 67) % 360
    const color = `hsl(${hue} 90% 65%)`
    const alpha = track.state === 'lost' ? 0.45 : 1
    const rect = this.mapRect(track.bbox, transform)
    const center = this.mapPoint(track.center, transform)

    context.save()
    context.globalAlpha = alpha
    context.strokeStyle = color
    context.fillStyle = color
    context.lineWidth = 2
    context.setLineDash(track.state === 'lost' ? [6, 5] : [])

    if (showTrail && track.trail.length > 1) {
      context.beginPath()
      track.trail.forEach((point, index) => {
        const mappedPoint = this.mapPoint(point, transform)

        if (index === 0) {
          context.moveTo(mappedPoint.x, mappedPoint.y)
        } else {
          context.lineTo(mappedPoint.x, mappedPoint.y)
        }
      })
      context.stroke()
    }

    context.strokeRect(rect.x, rect.y, rect.width, rect.height)
    context.setLineDash([])
    context.beginPath()
    context.arc(center.x, center.y, 4, 0, Math.PI * 2)
    context.fill()
    this.drawLabel(track.id, rect.x, rect.y, color)
    context.restore()
  }

  private drawLabel(id: number, x: number, y: number, color: string): void {
    const context = this.overlayContext
    const label = `ID ${id.toString().padStart(4, '0')}`
    context.font = '600 12px system-ui, sans-serif'
    const textWidth = context.measureText(label).width
    const labelWidth = textWidth + 12
    const labelHeight = 22
    const labelX = Math.max(0, Math.min(x, this.cssWidth - labelWidth))
    const labelY = y >= labelHeight ? y - labelHeight : y

    context.fillStyle = 'rgb(10 15 25 / 82%)'
    context.fillRect(labelX, labelY, labelWidth, labelHeight)
    context.fillStyle = color
    context.fillText(label, labelX + 6, labelY + 15)
  }

  private mapPoint(point: Point, transform: CoverTransform): Point {
    return {
      x:
        (point.x / this.analysisWidth) * transform.renderWidth +
        transform.offsetX,
      y:
        (point.y / this.analysisHeight) * transform.renderHeight +
        transform.offsetY,
    }
  }

  private mapRect(rect: Rect, transform: CoverTransform): Rect {
    const topLeft = this.mapPoint({ x: rect.x, y: rect.y }, transform)
    const bottomRight = this.mapPoint(
      {
        x: rect.x + rect.width,
        y: rect.y + rect.height,
      },
      transform,
    )

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    }
  }
}
