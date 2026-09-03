import type { Point, Rect, Track } from '../tracking/types.ts'

type CoverTransform = {
  renderWidth: number
  renderHeight: number
  offsetX: number
  offsetY: number
}

export class OverlayRenderer {
  private readonly context: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement
  private readonly analysisWidth: number
  private readonly analysisHeight: number
  private cssWidth = 1
  private cssHeight = 1

  constructor(
    canvas: HTMLCanvasElement,
    analysisWidth: number,
    analysisHeight: number,
  ) {
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to get 2D context from canvas.')
    }
    this.canvas = canvas
    this.analysisWidth = analysisWidth
    this.analysisHeight = analysisHeight
    this.context = context
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const safeWidth = Math.max(1, cssWidth)
    const safeHeight = Math.max(1, cssHeight)
    const pixelRatio = Math.min(Math.max(1, devicePixelRatio), 2)
    const renderWidth = Math.round(safeWidth * pixelRatio)
    const renderHeight = Math.round(safeHeight * pixelRatio)
    this.cssWidth = safeWidth
    this.cssHeight = safeHeight

    if (this.canvas.width !== renderWidth || this.canvas.height !== renderHeight) {
      this.canvas.width = renderWidth
      this.canvas.height = renderHeight
    }
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  }

  clear(): void {
    this.context.clearRect(0, 0, this.cssWidth, this.cssHeight)
  }

  render(
    tracks: readonly Track[],
    sourceWidth: number,
    sourceHeight: number,
    showTrail: boolean,
  ): void {
    this.clear()
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return
    }

    const transform = this.createCoverTransform(sourceWidth, sourceHeight)
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

  private drawTrack(track: Track, transform: CoverTransform, showTrail: boolean): void {
    const context = this.context
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
    const context = this.context
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
