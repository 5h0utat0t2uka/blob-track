import assert from 'node:assert/strict'
import test from 'node:test'
import { BlobTracker } from '../src/tracking/BlobTracker.ts'
import { ConnectedComponents } from '../src/tracking/ConnectedComponents.ts'
import { MotionDetector } from '../src/tracking/MotionDetector.ts'
import { FrameScheduler } from '../src/tracking/FrameScheduler.ts'
import { timeConstantFrom30FpsRate } from '../src/tracking/timing.ts'
import type {
  Detection,
  TrackingSettings,
} from '../src/tracking/types.ts'

const SETTINGS: TrackingSettings = {
  motionThreshold: 28,
  backgroundTimeConstantMs: timeConstantFrom30FpsRate(0.01),
  minBlobAreaRatio: 0.003,
  maxMissingDurationMs: 300,
  maxMatchDistanceRatio: 0.2,
  trailDurationMs: 500,
  showTrail: true,
}

test('MotionDetectorは背景初期化後に3×3の動体領域を検出する', () => {
  const width = 5
  const height = 5
  const detector = new MotionDetector(width, height)
  const background = imageData(width, height, [])

  for (let frame = 0; frame <= 21; frame += 1) {
    detector.process(background, frame === 0 ? 0 : 1000 / 30, {
        threshold: 20,
        backgroundTimeConstantMs: SETTINGS.backgroundTimeConstantMs,
      })
  }

  const foreground = imageData(
    width,
    height,
    [6, 7, 8, 11, 12, 13, 16, 17, 18],
  )
  const result = detector.process(foreground, 1000 / 30, {
    threshold: 20,
    backgroundTimeConstantMs: SETTINGS.backgroundTimeConstantMs,
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

  assert.equal(tracker.update([detectionAt(20, 20)], 0, SETTINGS).length, 0)

  const confirmed = tracker.update([detectionAt(23, 21)], 50, SETTINGS)
  assert.equal(confirmed.length, 1)
  assert.equal(confirmed[0].id, 1)
  assert.equal(confirmed[0].state, 'confirmed')

  const lost = tracker.update([], 100, SETTINGS)
  assert.equal(lost.length, 1)
  assert.equal(lost[0].id, 1)
  assert.equal(lost[0].state, 'lost')

  const recovered = tracker.update([detectionAt(27, 22)], 150, SETTINGS)
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0].id, 1)
  assert.equal(recovered[0].state, 'confirmed')
})

test('BlobTrackerは欠落時間の境界を超えたTrackを破棄する', () => {
  const tracker = new BlobTracker(100, 100)
  tracker.update([detectionAt(20, 20)], 0, SETTINGS)
  tracker.update([detectionAt(21, 20)], 50, SETTINGS)

  assert.equal(tracker.update([], 350, SETTINGS).length, 1)
  const expired = tracker.update([], 351, SETTINGS)

  assert.equal(expired.length, 0)

  tracker.update([detectionAt(22, 20)], 400, SETTINGS)
  const replacement = tracker.update([detectionAt(23, 20)], 450, SETTINGS)
  assert.equal(replacement[0].id, 2)
})

test('期限後の再検出は古いIDを復活させない', () => {
  const tracker = new BlobTracker(100, 100)
  tracker.update([detectionAt(20, 20)], 0, SETTINGS)
  tracker.update([detectionAt(20, 20)], 50, SETTINGS)
  assert.equal(tracker.update([detectionAt(20, 20)], 351, SETTINGS).length, 0)
  assert.equal(tracker.update([detectionAt(20, 20)], 400, SETTINGS)[0].id, 2)
})

for (const fps of [15, 20, 30]) {
  test(`${fps}fpsでも同じ実時間の速度・軌跡寿命を維持する`, () => {
    const tracker = new BlobTracker(320, 180)
    let tracks = tracker.update([detectionAt(20, 20)], 0, SETTINGS)
    for (let frame = 1; frame <= fps; frame += 1) {
      const timestampMs = frame * 1000 / fps
      tracks = tracker.update([detectionAt(20 + timestampMs * 0.06, 20)], timestampMs, SETTINGS)
      assert.equal(tracks[0].id, 1)
    }
    assert.ok(Math.abs(tracks[0].velocity.x - 60) < 0.001)
    assert.ok(tracks[0].trail.every((point) => point.timestampMs >= 500))
    const lost = tracker.update([], 1200, SETTINGS)[0]
    // Analytic prediction must not depend on the number of prior updates.
    const tauSeconds = timeConstantFrom30FpsRate(0.1) / 1000
    const expectedX = 80 + tracks[0].velocity.x * tauSeconds * (1 - Math.exp(-0.2 / tauSeconds))
    assert.ok(Math.abs(lost.center.x - expectedX) < 0.001)
    assert.equal(tracker.update([detectionAt(95, 20)], 1250, SETTINGS)[0].id, 1)
    assert.ok(Math.abs(tracks[0].velocity.x - 60) < 0.001)
  })

  test(`${fps}fpsで背景初期化は約700msで完了する`, () => {
    const detector = new MotionDetector(5, 5)
    const frame = imageData(5, 5, [])
    const options = { threshold: 20, backgroundTimeConstantMs: 3300 }
    assert.equal(detector.process(frame, 0, options).isCalibrating, true)
    let elapsedMs = 0
    let calibrating = true
    while (calibrating) {
      elapsedMs += 1000 / fps
      calibrating = detector.process(frame, 1000 / fps, options).isCalibrating
      assert.ok(elapsedMs < 800)
    }
    assert.ok(elapsedMs >= 700)
    assert.ok(elapsedMs <= 700 + 1000 / fps)
  })

  test(`30fps入力から平均${fps}fpsを選択する`, () => {
    const scheduler = new FrameScheduler()
    let selected = 0
    for (let index = 0; index < 300; index += 1) {
      selected += Number(scheduler.shouldProcess(index * 1000 / 30, fps))
    }
    assert.equal(selected, fps * 10)
  })
}

test('不均一な解析間隔・FPS変更でも速度とIDを維持する', () => {
  const tracker = new BlobTracker(320, 180)
  const scheduler = new FrameScheduler()
  for (let index = 0; index <= 90; index += 1) {
    const timestampMs = index * 1000 / 30
    const fps = index < 30 ? 15 : index < 60 ? 20 : 30
    if (scheduler.shouldProcess(timestampMs, fps)) {
      const tracks = tracker.update([detectionAt(20 + timestampMs * 0.04, 20)], timestampMs, SETTINGS)
      if (index > 3) assert.equal(tracks[0].id, 1)
      if (index > 30) assert.ok(Math.abs(tracks[0].velocity.x - 40) < 0.001)
    }
  }
})

test('欠落中の予測は更新回数によらず同じ位置になる', () => {
  const predict = (timestamps: number[]) => {
    const tracker = new BlobTracker(320, 180)
    tracker.update([detectionAt(20, 20)], 0, SETTINGS)
    tracker.update([detectionAt(25, 20)], 50, SETTINGS)
    for (const timestampMs of timestamps) tracker.update([], timestampMs, SETTINGS)
    return tracker.update([], 300, SETTINGS)[0].center
  }
  assert.deepEqual(predict([100, 150, 200, 250]), predict([]))
})

test('同じtimestampを再処理せず、時刻巻き戻りでは再初期化する', () => {
  const tracker = new BlobTracker(100, 100)
  tracker.update([detectionAt(20, 20)], 100, SETTINGS)
  assert.equal(tracker.update([detectionAt(20, 20)], 100, SETTINGS).length, 0)
  assert.equal(tracker.update([detectionAt(20, 20)], 150, SETTINGS)[0].hits, 2)
  assert.equal(tracker.update([detectionAt(20, 20)], 0, SETTINGS).length, 0)
})

test('deadline方式は丸め・FPS変更・長時間中断・リセットを処理する', () => {
  const scheduler = new FrameScheduler()
  let selected = 0
  for (let index = 0; index < 300; index += 1) {
    const timestampMs = Math.round(index * 1000 / 30)
    selected += Number(scheduler.shouldProcess(timestampMs, 30))
    assert.equal(scheduler.shouldProcess(timestampMs, 30), false)
  }
  assert.equal(selected, 300)
  assert.equal(scheduler.shouldProcess(10000, 15), true)
  assert.equal(scheduler.shouldProcess(10033, 15), false)
  assert.equal(scheduler.shouldProcess(10066, 30), true)
  assert.equal(scheduler.shouldProcess(86_400_000, 20), true)
  assert.equal(scheduler.shouldProcess(86_400_010, 20), false)
  assert.equal(scheduler.shouldProcess(0, 20), true)
  scheduler.reset()
  assert.equal(scheduler.shouldProcess(0, 20), true)
})

test('背景学習は15/20/30fpsでも同じ経過時間で同じ判定になる', () => {
  const uniformFrame = (value: number): ImageData => ({
    width: 5, height: 5, colorSpace: 'srgb',
    data: new Uint8ClampedArray(5 * 5 * 4).fill(value),
  } as ImageData)
  for (const fps of [15, 20, 30]) {
    for (const seconds of [1, 2]) {
      const detector = new MotionDetector(5, 5)
      const options = { threshold: 100, backgroundTimeConstantMs: 1000 }
      detector.process(uniformFrame(0), 0, options)
      detector.process(uniformFrame(0), 700, options)
      for (let frame = 0; frame < fps * seconds; frame += 1) {
        detector.process(uniformFrame(50), 1000 / fps, options)
      }
      // B(1s)≈31.6, B(2s)≈43.2. A 100-gray probe with threshold 60
      // must trigger global change at 1s but not at 2s, at every sample rate.
      const result = detector.process(uniformFrame(100), 0, { ...options, threshold: 60 })
      assert.equal(result.isCalibrating, seconds === 1)
    }
  }
})

test('前景の緩い学習もFPSではなく経過時間に従う', () => {
  const region = [6, 7, 8, 11, 12, 13, 16, 17, 18]
  for (const fps of [15, 20, 30]) {
    const detector = new MotionDetector(5, 5)
    const options = { threshold: 20, backgroundTimeConstantMs: 3300 }
    const background = imageData(5, 5, [])
    const foreground = imageData(5, 5, region)
    detector.process(background, 0, options)
    detector.process(background, 700, options)
    for (let frame = 0; frame < fps * 90; frame += 1) {
      detector.process(foreground, 1000 / fps, options)
    }
    assert.equal(detector.process(foreground, 0, options).foregroundRatio, 9 / 25)
    for (let frame = 0; frame < fps * 10; frame += 1) {
      detector.process(foreground, 1000 / fps, options)
    }
    assert.equal(detector.process(foreground, 0, options).foregroundRatio, 0)
  }
})

test('全画面変化時の再学習もFPSによらずほぼ同じ時間で完了する', () => {
  for (const fps of [15, 20, 30]) {
    const detector = new MotionDetector(5, 5)
    const options = { threshold: 20, backgroundTimeConstantMs: 3300 }
    const background = imageData(5, 5, [])
    const foreground = imageData(5, 5, Array.from({ length: 25 }, (_, index) => index))
    detector.process(background, 0, options)
    detector.process(background, 700, options)
    let elapsedMs = 0
    let calibrating = true
    while (calibrating) {
      elapsedMs += 1000 / fps
      calibrating = detector.process(foreground, 1000 / fps, options).isCalibrating
      assert.ok(elapsedMs < 600)
    }
    const crossingMs = timeConstantFrom30FpsRate(0.2) * Math.log(255 / 20)
    assert.ok(elapsedMs >= crossingMs)
    assert.ok(elapsedMs <= crossingMs + 2 * 1000 / fps)
  }
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
