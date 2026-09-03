import assert from 'node:assert/strict'
import test from 'node:test'
import { BlobTracker } from '../src/tracking/BlobTracker.ts'
import { ConnectedComponents } from '../src/tracking/ConnectedComponents.ts'
import { MotionDetector } from '../src/tracking/MotionDetector.ts'
import type {
  Detection,
  TrackingSettings,
} from '../src/tracking/types.ts'

const SETTINGS: TrackingSettings = {
  motionThreshold: 28,
  backgroundLearningRate: 0.01,
  minBlobAreaRatio: 0.003,
  maxMissingFrames: 2,
  maxMatchDistanceRatio: 0.2,
  trailLength: 4,
  showTrail: true,
}

test('MotionDetectorは背景初期化後に3×3の動体領域を検出する', () => {
  const width = 5
  const height = 5
  const detector = new MotionDetector(width, height)
  const background = imageData(width, height, [])

  for (let frame = 0; frame < 21; frame += 1) {
    assert.equal(
      detector.process(background, {
        threshold: 20,
        backgroundLearningRate: 0.01,
      }).isCalibrating,
      true,
    )
  }

  const foreground = imageData(
    width,
    height,
    [6, 7, 8, 11, 12, 13, 16, 17, 18],
  )
  const result = detector.process(foreground, {
    threshold: 20,
    backgroundLearningRate: 0.01,
  })

  assert.equal(result.isCalibrating, false)
  assert.equal(result.mask.reduce((sum, value) => sum + value, 0), 9)
})

test('ConnectedComponentsは8近傍でBlobと矩形を抽出する', () => {
  const width = 6
  const height = 5
  const mask = new Uint8Array(width * height)

  for (const index of [7, 8, 13, 14, 27, 28]) {
    mask[index] = 1
  }

  const components = new ConnectedComponents(width, height)
  const detections = components.extract(mask, 2)

  assert.equal(detections.length, 2)
  assert.deepEqual(detections[0].bbox, {
    x: 1,
    y: 1,
    width: 2,
    height: 2,
  })
  assert.equal(detections[0].area, 4)
  assert.deepEqual(detections[1].bbox, {
    x: 3,
    y: 4,
    width: 2,
    height: 1,
  })
})

test('BlobTrackerは確認済みIDを短い欠落の後も維持する', () => {
  const tracker = new BlobTracker(100, 100)

  assert.equal(tracker.update([detectionAt(20, 20)], SETTINGS).length, 0)

  const confirmed = tracker.update([detectionAt(23, 21)], SETTINGS)
  assert.equal(confirmed.length, 1)
  assert.equal(confirmed[0].id, 1)
  assert.equal(confirmed[0].state, 'confirmed')

  const lost = tracker.update([], SETTINGS)
  assert.equal(lost.length, 1)
  assert.equal(lost[0].id, 1)
  assert.equal(lost[0].state, 'lost')

  const recovered = tracker.update([detectionAt(27, 22)], SETTINGS)
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0].id, 1)
  assert.equal(recovered[0].state, 'confirmed')
})

test('BlobTrackerは最大欠落フレームを超えたTrackを破棄する', () => {
  const tracker = new BlobTracker(100, 100)
  tracker.update([detectionAt(20, 20)], SETTINGS)
  tracker.update([detectionAt(21, 20)], SETTINGS)

  tracker.update([], SETTINGS)
  tracker.update([], SETTINGS)
  const expired = tracker.update([], SETTINGS)

  assert.equal(expired.length, 0)

  tracker.update([detectionAt(22, 20)], SETTINGS)
  const replacement = tracker.update([detectionAt(23, 20)], SETTINGS)
  assert.equal(replacement[0].id, 2)
})

function detectionAt(x: number, y: number): Detection {
  return {
    bbox: { x: x - 5, y: y - 5, width: 10, height: 10 },
    center: { x, y },
    area: 100,
  }
}

function imageData(
  width: number,
  height: number,
  whitePixelIndexes: readonly number[],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)

  for (const pixelIndex of whitePixelIndexes) {
    const dataIndex = pixelIndex * 4
    data[dataIndex] = 255
    data[dataIndex + 1] = 255
    data[dataIndex + 2] = 255
    data[dataIndex + 3] = 255
  }

  return { data, width, height, colorSpace: 'srgb' } as ImageData
}
