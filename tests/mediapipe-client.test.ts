import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { ObjectDetectorClient, type ObjectDetectorResult } from '../src/components/mediapipe-tasks-vision/ObjectDetectorClient.ts'
import type { DetectorWorkerRequest, DetectorWorkerResponse } from '../src/components/mediapipe-tasks-vision/protocol.ts'

type FrameRequest = Extract<DetectorWorkerRequest, { type: 'frame' }>

function fixture(t: TestContext) {
  class FakeWorker extends EventTarget {
    sent: DetectorWorkerRequest[] = []
    transfers: Transferable[][] = []
    terminated = false
    postMessage(message: DetectorWorkerRequest, transfer: Transferable[] = []) {
      this.sent.push(message)
      this.transfers.push(transfer)
    }
    terminate() { this.terminated = true }
    reply(message: DetectorWorkerResponse) {
      this.dispatchEvent(new MessageEvent('message', { data: message }))
    }
  }
  const workers: FakeWorker[] = []
  const captures: { options: ImageBitmapOptions; bitmap: ImageBitmap; closed: boolean }[] = []
  let time = 0
  let captureDelay: Promise<void> | undefined
  const globals = {
    Worker: class extends FakeWorker {
      constructor() { super(); workers.push(this) }
    },
    window: { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout },
    createImageBitmap: async (_video: HTMLVideoElement, options: ImageBitmapOptions) => {
      await captureDelay
      const entry = {
        options,
        closed: false,
        bitmap: { width: options.resizeWidth, height: options.resizeHeight, close() { entry.closed = true } } as ImageBitmap,
      }
      captures.push(entry)
      return entry.bitmap
    },
  }
  const restoreGlobals: (() => void)[] = []
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
    restoreGlobals.push(() => {
      if (original) Object.defineProperty(globalThis, name, original)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
  t.mock.method(performance, 'now', () => time)
  const results: ObjectDetectorResult[] = []
  const skipped: string[] = []
  const statuses: string[] = []
  const client = new ObjectDetectorClient({
    onResult: result => results.push(result),
    onStatusChange: status => statuses.push(status),
    onSkippedFrame: reason => skipped.push(reason),
  })
  const worker = workers[0]
  client.initialize('/model', '/wasm', ['person'], 0.7)
  const init = worker.sent[0]
  assert.equal(init.type, 'init')
  worker.reply({ type: 'ready', generation: init.generation })
  const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement
  const finish = (frame: FrameRequest) => worker.reply({
    type: 'result', generation: frame.generation, timestampMs: frame.timestampMs,
    width: frame.sourceWidth, height: frame.sourceHeight, detections: [], inferenceTimeMs: 20,
  })
  const frames = () => worker.sent.filter((message): message is FrameRequest => message.type === 'frame')
  t.after(() => {
    client.dispose()
    worker.reply({ type: 'disposed' })
    for (const restore of restoreGlobals) restore()
  })
  return { client, worker, video, captures, results, skipped, statuses, finish, frames,
    setTime(value: number) { time = value },
    delayCapture(value: Promise<void>) { captureDelay = value },
  }
}

test('110msの非同期処理で実行枠を失わず、30fps入力・10fps設定で7.5fpsを処理する', async t => {
  const f = fixture(t)
  let pending: FrameRequest | undefined
  for (let i = 0; i < 300; i++) {
    const time = i * 1000 / 30
    f.setTime(time)
    if (pending && time >= pending.timestampMs + 110) {
      f.finish(pending)
      pending = undefined
    }
    await f.client.submitFrame(f.video, time, 10)
    pending ??= f.frames().at(-1)
  }
  assert.equal(f.frames().length, 75)
  assert.equal(f.captures.length, 75)
  assert.equal(f.skipped.filter(reason => reason === 'busy').length, 225)
})

test('正常なFPS間引きとbusyを分け、縮小画像を所有権転送する', async t => {
  const f = fixture(t)
  await f.client.submitFrame(f.video, 0, 10)
  await f.client.submitFrame(f.video, 33, 10)
  f.finish(f.frames()[0])
  await f.client.submitFrame(f.video, 66, 10)
  await f.client.submitFrame(f.video, 100, 10)
  assert.deepEqual(f.skipped, ['busy', 'rate-limit'])
  assert.equal(f.frames().length, 2)
  assert.deepEqual(f.captures[0].options, { resizeWidth: 640, resizeHeight: 360, resizeQuality: 'low' })
  assert.equal(f.frames()[0].sourceWidth, 1280)
  assert.equal(f.frames()[0].sourceHeight, 720)
  assert.equal(f.worker.transfers[1][0], f.captures[0].bitmap)
})

test('captureとWorker往復は同じmain-thread clockで独立して計測する', async t => {
  const f = fixture(t)
  let release!: () => void
  f.delayCapture(new Promise<void>(resolve => { release = resolve }))
  const capturing = f.client.submitFrame(f.video, 0, 10)
  f.setTime(5)
  release()
  await capturing
  f.setTime(35)
  f.finish(f.frames()[0])
  assert.equal(f.results[0].captureTimeMs, 5)
  assert.equal(f.results[0].roundTripTimeMs, 30)
  assert.equal(f.results[0].startedAtMs, 0)
  assert.equal(f.results[0].inferenceTimeMs, 20)
})

test('世代変更中のcaptureを解放し、古い推論結果を破棄して新しいsessionを開始する', async t => {
  const f = fixture(t)
  let release!: () => void
  f.delayCapture(new Promise<void>(resolve => { release = resolve }))
  const capturing = f.client.submitFrame(f.video, 0, 10)
  f.client.beginSession()
  release()
  await capturing
  assert.equal(f.captures[0].closed, true)
  assert.equal(f.frames().length, 0)
  await f.client.submitFrame(f.video, 10, 10)
  const stale = f.frames()[0]
  f.client.beginSession()
  f.finish(stale)
  assert.equal(f.results.length, 0)
  await f.client.submitFrame(f.video, 20, 10)
  f.finish(f.frames()[1])
  assert.equal(f.results.length, 1)
  assert.equal(f.results[0].timestampMs, 20)
})
