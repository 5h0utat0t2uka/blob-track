import assert from 'node:assert/strict'
import test from 'node:test'
import { OverlayRenderer } from '../src/rendering/OverlayRenderer.ts'
import { getAnalysisSize, TrackingEngine } from '../src/tracking/TrackingEngine.ts'
import type { Rect, Track, TrackingSettings } from '../src/tracking/types.ts'

const SETTINGS: TrackingSettings = {
  motionThreshold: 20,
  backgroundTimeConstantMs: 3300,
  minBlobAreaRatio: 0.02,
  maxMissingDurationMs: 300,
  maxMatchDistanceRatio: 0.12,
  trailDurationMs: 1700,
  showTrail: true,
}

// Record drawing operations without relying on a browser or real camera.
function canvasFixture() {
  const drawCalls: unknown[][] = []
  const boxes: number[][] = []
  const transforms: number[][] = []
  let clears = 0
  let reads = 0
  let region: Rect | null = null
  const context = {
    drawImage: (...args: unknown[]) => drawCalls.push(args),
    clearRect: () => { clears += 1 },
    setTransform: (...args: number[]) => transforms.push(args),
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    setLineDash() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
    fillRect() {}, fillText() {},
    strokeRect: (...args: number[]) => boxes.push(args),
    measureText: () => ({ width: 40 }),
    getImageData: (_x: number, _y: number, width: number, height: number) => {
      reads += 1
      const data = new Uint8ClampedArray(width * height * 4)
      if (region) {
        for (let y = region.y; y < region.y + region.height; y += 1) {
          for (let x = region.x; x < region.x + region.width; x += 1) {
            data.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4)
          }
        }
      }
      return { width, height, data, colorSpace: 'srgb' }
    },
  }
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement
  return {
    canvas, drawCalls, boxes, transforms,
    get clears() { return clears },
    get reads() { return reads },
    setRegion(value: Rect) { region = value },
  }
}

test('解析寸法は入力の縦横比を保持して長辺320以内に収める', () => {
  assert.deepEqual(getAnalysisSize(1280, 720), { width: 320, height: 180 })
  assert.deepEqual(getAnalysisSize(720, 1280), { width: 180, height: 320 })
  assert.deepEqual(getAnalysisSize(640, 480), { width: 320, height: 240 })
  assert.deepEqual(getAnalysisSize(1000, 1000), { width: 320, height: 320 })
  assert.deepEqual(getAnalysisSize(160, 90), { width: 160, height: 90 })
  assert.throws(() => getAnalysisSize(0, 720), RangeError)
})

for (const [sourceWidth, sourceHeight] of [[1280, 720], [720, 1280]]) {
  test(`${sourceWidth}x${sourceHeight}のcover座標は切り抜き映像と枠で一致する`, () => {
    const filtered = canvasFixture()
    const overlay = canvasFixture()
    const { width, height } = getAnalysisSize(sourceWidth, sourceHeight)
    const renderer = new OverlayRenderer(filtered.canvas, overlay.canvas, width, height)
    renderer.resize(640, 480, 3)
    assert.equal(filtered.canvas.width, 1280)
    assert.equal(overlay.canvas.height, 960)
    assert.deepEqual(filtered.transforms.at(-1), [2, 0, 0, 2, 0, 0])
    const bbox = { x: 0, y: 0, width, height }
    const center = { x: width / 2, y: height / 2 }
    const track: Track = {
      id: 1, bbox, center, velocity: { x: 0, y: 0 },
      lastObservedCenter: center, lastObservedBox: bbox, lastObservedAtMs: 0,
      state: 'confirmed', hits: 2, trail: [],
    }
    const video = { videoWidth: sourceWidth, videoHeight: sourceHeight } as HTMLVideoElement
    renderer.render([track], video, false)
    const scale = Math.max(640 / sourceWidth, 480 / sourceHeight)
    const destination = [(640 - sourceWidth * scale) / 2, (480 - sourceHeight * scale) / 2, sourceWidth * scale, sourceHeight * scale]
    const drawn = filtered.drawCalls[0]
    assert.deepEqual(drawn.slice(1, 5), [0, 0, sourceWidth, sourceHeight])
    for (let index = 0; index < 4; index += 1) {
      assert.ok(Math.abs(Number(drawn[index + 5]) - destination[index]) < 1e-9)
      assert.ok(Math.abs(overlay.boxes[0][index] - destination[index]) < 1e-9)
    }
    renderer.render([{ ...track, state: 'lost' }], video, false)
    assert.equal(filtered.drawCalls.length, 1)
    assert.equal(overlay.boxes.length, 2)
    renderer.clear()
    assert.equal(filtered.clears, overlay.clears)
  })
}

test('入力サイズ変更で解析バッファと背景を再初期化する', () => {
  const analysis = canvasFixture()
  const filtered = canvasFixture()
  const overlay = canvasFixture()
  const engine = new TrackingEngine(analysis.canvas, filtered.canvas, overlay.canvas)
  const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement
  for (let timestampMs = 0; timestampMs <= 800; timestampMs += 100) {
    engine.process(video, timestampMs, SETTINGS)
  }
  assert.equal(analysis.canvas.width, 320)
  assert.equal(analysis.canvas.height, 180)
  Object.assign(video, { videoWidth: 720, videoHeight: 1280 })
  engine.syncVideoSize(video)
  assert.equal(analysis.canvas.width, 180)
  assert.equal(analysis.canvas.height, 320)
  assert.equal(engine.process(video, 900, SETTINGS).isCalibrating, true)
  assert.equal(filtered.clears, overlay.clears)
})

test('重複フレームを再解析せず、中断・巻き戻り・リセットで追跡を初期化する', () => {
  const analysis = canvasFixture()
  const filtered = canvasFixture()
  const overlay = canvasFixture()
  const engine = new TrackingEngine(analysis.canvas, filtered.canvas, overlay.canvas)
  const video = { videoWidth: 5, videoHeight: 5 } as HTMLVideoElement
  for (let timestampMs = 0; timestampMs <= 800; timestampMs += 100) {
    engine.process(video, timestampMs, SETTINGS)
  }
  analysis.setRegion({ x: 1, y: 1, width: 3, height: 3 })
  engine.process(video, 850, SETTINGS)
  const confirmed = engine.process(video, 900, SETTINGS)
  assert.equal(confirmed.trackCount, 1)
  const reads = analysis.reads
  assert.deepEqual(engine.process(video, 900, SETTINGS), confirmed)
  assert.equal(analysis.reads, reads)
  const resumed = engine.process(video, 2000, SETTINGS)
  assert.equal(resumed.isCalibrating, true)
  assert.equal(resumed.trackCount, 0)
  assert.equal(engine.process(video, 0, SETTINGS).isCalibrating, true)
  engine.reset()
  assert.equal(engine.process(video, 0, SETTINGS).isCalibrating, true)
  assert.throws(() => engine.process(video, NaN, SETTINGS), RangeError)
})
