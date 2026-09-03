type MotionDetectorOptions = {
  threshold: number
  backgroundLearningRate: number
}

export type MotionDetectionResult = {
  mask: Uint8Array
  isCalibrating: boolean
  foregroundRatio: number
}

const WARMUP_FRAME_COUNT = 20
const WARMUP_LEARNING_RATE = 0.15
const FOREGROUND_LEARNING_RATE = 0.001
const GLOBAL_CHANGE_RATIO = 0.8
const GLOBAL_CHANGE_LEARNING_RATE = 0.2

export class MotionDetector {
  private readonly width: number
  private readonly height: number
  private readonly background: Float32Array
  private readonly gray: Uint8Array
  private readonly foregroundState: Uint8Array
  private readonly rawMask: Uint8Array
  private readonly scratchMask: Uint8Array
  private hasBackground = false
  private warmupFramesRemaining = WARMUP_FRAME_COUNT

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    const pixelCount = width * height
    this.background = new Float32Array(pixelCount)
    this.gray = new Uint8Array(pixelCount)
    this.foregroundState = new Uint8Array(pixelCount)
    this.rawMask = new Uint8Array(pixelCount)
    this.scratchMask = new Uint8Array(pixelCount)
  }

  reset(): void {
    this.background.fill(0)
    this.foregroundState.fill(0)
    this.rawMask.fill(0)
    this.scratchMask.fill(0)
    this.hasBackground = false
    this.warmupFramesRemaining = WARMUP_FRAME_COUNT
  }

  process(
    frame: ImageData,
    options: MotionDetectorOptions,
  ): MotionDetectionResult {
    this.toGrayscale(frame.data)

    if (!this.hasBackground) {
      this.background.set(this.gray)
      this.hasBackground = true
      this.rawMask.fill(0)
      return this.result(true, 0)
    }

    if (this.warmupFramesRemaining > 0) {
      this.updateEntireBackground(WARMUP_LEARNING_RATE)
      this.warmupFramesRemaining -= 1
      this.foregroundState.fill(0)
      this.rawMask.fill(0)
      return this.result(true, 0)
    }

    const threshold = options.threshold
    const releaseThreshold = threshold * 0.7
    let foregroundPixelCount = 0

    for (let index = 0; index < this.gray.length; index += 1) {
      const difference = Math.abs(this.gray[index] - this.background[index])
      const wasForeground = this.foregroundState[index] === 1
      const isForeground =
        difference >= threshold ||
        (wasForeground && difference >= releaseThreshold)

      this.foregroundState[index] = isForeground ? 1 : 0
      this.rawMask[index] = isForeground ? 1 : 0
      foregroundPixelCount += isForeground ? 1 : 0
    }

    const foregroundRatio = foregroundPixelCount / this.gray.length

    if (foregroundRatio >= GLOBAL_CHANGE_RATIO) {
      this.updateEntireBackground(GLOBAL_CHANGE_LEARNING_RATE)
      this.foregroundState.fill(0)
      this.rawMask.fill(0)
      return this.result(true, foregroundRatio)
    }

    for (let index = 0; index < this.gray.length; index += 1) {
      const learningRate =
        this.rawMask[index] === 1
          ? FOREGROUND_LEARNING_RATE
          : options.backgroundLearningRate

      this.background[index] +=
        learningRate * (this.gray[index] - this.background[index])
    }

    this.applyOpening()
    return this.result(false, foregroundRatio)
  }

  private toGrayscale(source: Uint8ClampedArray): void {
    for (
      let sourceIndex = 0, targetIndex = 0;
      targetIndex < this.gray.length;
      sourceIndex += 4, targetIndex += 1
    ) {
      this.gray[targetIndex] =
        (77 * source[sourceIndex] +
          150 * source[sourceIndex + 1] +
          29 * source[sourceIndex + 2]) >>
        8
    }
  }

  private updateEntireBackground(learningRate: number): void {
    for (let index = 0; index < this.gray.length; index += 1) {
      this.background[index] +=
        learningRate * (this.gray[index] - this.background[index])
    }
  }

  private applyOpening(): void {
    const { width, height, rawMask, scratchMask } = this
    scratchMask.fill(0)

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x
        scratchMask[index] =
          rawMask[index - width - 1] &
          rawMask[index - width] &
          rawMask[index - width + 1] &
          rawMask[index - 1] &
          rawMask[index] &
          rawMask[index + 1] &
          rawMask[index + width - 1] &
          rawMask[index + width] &
          rawMask[index + width + 1]
      }
    }

    rawMask.fill(0)

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x
        rawMask[index] =
          scratchMask[index - width - 1] |
          scratchMask[index - width] |
          scratchMask[index - width + 1] |
          scratchMask[index - 1] |
          scratchMask[index] |
          scratchMask[index + 1] |
          scratchMask[index + width - 1] |
          scratchMask[index + width] |
          scratchMask[index + width + 1]
      }
    }
  }

  private result(
    isCalibrating: boolean,
    foregroundRatio: number,
  ): MotionDetectionResult {
    return {
      mask: this.rawMask,
      isCalibrating,
      foregroundRatio,
    }
  }
}
