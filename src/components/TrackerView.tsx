import { useEffect, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera.ts'
import type { CameraStatus } from '../camera/CameraSession.ts'
import {
  TrackingEngine,
  type FrameResult,
} from '../tracking/TrackingEngine.ts'
import type { TrackingSettings } from '../tracking/types.ts'
import { FrameScheduler } from '../tracking/FrameScheduler.ts'

const DEFAULT_SETTINGS: TrackingSettings = {
  motionThreshold: 70,
  backgroundTimeConstantMs: 3300,
  minBlobAreaRatio: 0.02,
  maxMissingDurationMs: 300,
  maxMatchDistanceRatio: 0.12,
  trailDurationMs: 1700,
  showTrail: true,
}

type RuntimeMetrics = FrameResult & {
  analysisFps: number
  averageProcessingTime: number
  missedVideoFrames: number
}

const INITIAL_METRICS: RuntimeMetrics = {
  trackCount: 0,
  detectionCount: 0,
  isCalibrating: false,
  foregroundRatio: 0,
  analysisFps: 0,
  averageProcessingTime: 0,
  missedVideoFrames: 0,
}

export function TrackerView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null)
  const filterCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<TrackingEngine | null>(null)
  const settingsRef = useRef(DEFAULT_SETTINGS)
  const targetFpsRef = useRef(30)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [targetFps, setTargetFps] = useState(30)
  const [metrics, setMetrics] = useState(INITIAL_METRICS)
  const [engineError, setEngineError] = useState<string | null>(null)
  const camera = useCamera(videoRef)

  settingsRef.current = settings
  targetFpsRef.current = targetFps

  useEffect(() => {
    const analysisCanvas = analysisCanvasRef.current
    const filterCanvas = filterCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    const stage = stageRef.current

    if (!analysisCanvas || !filterCanvas || !overlayCanvas || !stage) {
      return
    }

    const engine = new TrackingEngine(
      analysisCanvas,
      filterCanvas,
      overlayCanvas,
    )
    engineRef.current = engine

    const resize = () => {
      const bounds = stage.getBoundingClientRect()
      engine.resizeOverlay(bounds.width, bounds.height, window.devicePixelRatio)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(stage)
    resize()

    return () => {
      resizeObserver.disconnect()
      engine.reset()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const engine = engineRef.current

    if (camera.status !== 'running' || !video || !engine) {
      engine?.reset()
      setMetrics(INITIAL_METRICS)
      return
    }

    if (typeof video.requestVideoFrameCallback !== 'function') {
      setEngineError('このブラウザは映像フレーム解析APIに対応していません。')
      camera.stop()
      return
    }

    let active = true
    let callbackId: number | null = null
    const scheduler = new FrameScheduler()
    let lastReportAt = performance.now()
    let lastPresentedFrames: number | null = null
    let processedFrames = 0
    let totalProcessingTime = 0
    let missedVideoFrames = 0
    let latestResult: FrameResult = {
      trackCount: 0,
      detectionCount: 0,
      isCalibrating: true,
      foregroundRatio: 0,
    }

    const resetProcessing = () => {
      scheduler.reset()
      engine.reset()
      lastReportAt = performance.now()
      lastPresentedFrames = null
      processedFrames = 0
      totalProcessingTime = 0
      missedVideoFrames = 0
      latestResult = { ...INITIAL_METRICS, isCalibrating: true }
      setMetrics({ ...INITIAL_METRICS, isCalibrating: true })
    }
    const handleVideoResize = () => {
      engine.syncVideoSize(video)
      resetProcessing()
    }

    const processFrame: VideoFrameRequestCallback = (now, metadata) => {
      if (!active) {
        return
      }

      if (document.visibilityState !== 'visible') {
        callbackId = video.requestVideoFrameCallback(processFrame)
        return
      }

      if (lastPresentedFrames !== null) {
        missedVideoFrames += Math.max(
          0,
          metadata.presentedFrames - lastPresentedFrames - 1,
        )
      }
      lastPresentedFrames = metadata.presentedFrames

      // presentationTime is a per-frame timestamp in milliseconds, unlike
      // mediaTime (seconds, potentially zero for live streams).
      try {
        if (scheduler.shouldProcess(metadata.presentationTime, targetFpsRef.current)) {
          const startedAt = performance.now()
          latestResult = engine.process(video, metadata.presentationTime, settingsRef.current)
          totalProcessingTime += performance.now() - startedAt
          processedFrames += 1
        }
      } catch (error) {
        active = false
        setEngineError(
          error instanceof Error
            ? error.message
            : 'Unknown error occurred during tracking.',
        )
        camera.stop()
        return
      }

      const reportDuration = now - lastReportAt
      if (reportDuration >= 500) {
        setMetrics({
          ...latestResult,
          analysisFps: (processedFrames * 1000) / reportDuration,
          averageProcessingTime:
            processedFrames === 0 ? 0 : totalProcessingTime / processedFrames,
          missedVideoFrames,
        })
        lastReportAt = now
        processedFrames = 0
        totalProcessingTime = 0
      }
      callbackId = video.requestVideoFrameCallback(processFrame)
    }

    setEngineError(null)
    resetProcessing()
    document.addEventListener('visibilitychange', resetProcessing)
    video.addEventListener('resize', handleVideoResize)
    callbackId = video.requestVideoFrameCallback(processFrame)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', resetProcessing)
      video.removeEventListener('resize', handleVideoResize)
      if (callbackId !== null) {
        video.cancelVideoFrameCallback(callbackId)
      }
      engine.reset()
    }
  }, [camera.status, camera.stop])

  const statusText = getStatusText(camera.status, metrics.isCalibrating)
  const cameraDescription = camera.info
    ? [
        camera.info.width && camera.info.height
          ? `${camera.info.width}×${camera.info.height}`
          : null,
        camera.info.frameRate
          ? `${camera.info.frameRate.toFixed(0)} fps`
          : null,
        camera.info.facingMode ?? null,
      ]
        .filter(Boolean)
        .join(' / ')
    : null

  return (
    <main className="tracker-app">
      <section className="video-stage" ref={stageRef} aria-label="カメラと追跡結果">
        <video ref={videoRef} autoPlay muted playsInline aria-hidden="true" />
        <canvas
          ref={filterCanvasRef}
          className="filter-canvas"
          aria-hidden="true"
        />
        <canvas ref={overlayCanvasRef} aria-hidden="true" />
        <canvas
          ref={analysisCanvasRef}
          className="analysis-canvas"
          aria-hidden="true"
        />

        {/*{camera.status !== 'running' && (
          <div className="stage-placeholder">
            <p>設定を開いてカメラを開始してください</p>
            <span>映像と解析結果は端末内だけで処理されます</span>
          </div>
        )}*/}

        <dl className="metrics" aria-label="Tracking metrics">
          <Metric label="TRACKS" value={metrics.trackCount.toString()} />
          <Metric
            label="MOTION"
            value={`${(metrics.foregroundRatio * 100).toFixed(1)}%`}
          />
          <Metric
            label="ANALYSIS"
            value={`${metrics.analysisFps.toFixed(1)} FPS`}
          />
          <Metric
            label="PROCESSING"
            value={`${metrics.averageProcessingTime.toFixed(1)} MS`}
          />
          <Metric label="BLOBS" value={metrics.detectionCount.toString()} />
          <Metric label="DROPPED" value={metrics.missedVideoFrames.toString()} />
        </dl>
      </section>


      <div className='global-controls'>
        <div>
          <a href="https://github.com/5h0utat0t2uka/blob-track" target="_blank" rel="noopener noreferrer">Blob tracker demo:</a>
          <p aria-live="polite">{statusText}</p>
        </div>
        <button
          type="button"
          // className="settings-trigger"
          popoverTarget="tracking-settings"
        >
          setting
        </button>
        {camera.status === 'running' || camera.status === 'suspended' || camera.status === 'requesting' ? (
          <button type="button" onClick={camera.stop}>
            abort
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void camera.start()}
          >
            start
          </button>
        )}
      </div>

      <aside
        id="tracking-settings"
        className="control-panel"
        aria-labelledby="settings-title"
        popover="auto"
      >
        <div className="popover-heading">
          <h2 id="settings-title">Setting</h2>
          <button
            type="button"
            popoverTarget="tracking-settings"
            popoverTargetAction="hide"
            aria-label="設定を閉じる"
          >
            Close
          </button>
        </div>


        {/*{camera.status === 'running' ? (
          <button type="button" onClick={camera.stop}>
            カメラを停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void camera.start()}
            disabled={camera.status === 'requesting'}
          >
            {camera.status === 'requesting' ? '接続中…' : 'カメラを開始'}
          </button>
        )}*/}

        <div className="control-list">
          <RangeControl
            label="Motion threshold"
            hint="大きいほど明確な変化だけを検出"
            min={5}
            max={80}
            step={1}
            value={settings.motionThreshold}
            displayValue={settings.motionThreshold.toString()}
            onChange={(motionThreshold) =>
              setSettings((current) => ({ ...current, motionThreshold }))
            }
          />
          <RangeControl
            label="Minimum blob area"
            hint="解析画面に占める最小割合"
            min={0.05}
            max={5}
            step={0.05}
            value={settings.minBlobAreaRatio * 100}
            displayValue={`${(settings.minBlobAreaRatio * 100).toFixed(2)}%`}
            onChange={(percentage) =>
              setSettings((current) => ({
                ...current,
                minBlobAreaRatio: percentage / 100,
              }))
            }
          />
          <RangeControl
            label="Background adaptation time"
            hint="大きいほど背景の変化へゆっくり適応"
            min={0.5}
            max={30}
            step={0.1}
            value={settings.backgroundTimeConstantMs / 1000}
            displayValue={`${(settings.backgroundTimeConstantMs / 1000).toFixed(1)} s`}
            onChange={(seconds) =>
              setSettings((current) => ({
                ...current,
                backgroundTimeConstantMs: seconds * 1000,
              }))
            }
          />
        </div>

        <div className="option-row">
          <label htmlFor="analysis-rate">Frame rate limit</label>
          <select
            id="analysis-rate"
            value={targetFps}
            onChange={(event) => setTargetFps(Number(event.target.value))}
          >
            <option value={30}>30 fps</option>
            <option value={20}>20 fps</option>
            <option value={15}>15 fps</option>
          </select>
        </div>

        <div className="option-row">
          <label htmlFor="show-trail">Show trails line</label>
          <input
            id="show-trail"
            type="checkbox"
            checked={settings.showTrail}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                showTrail: event.target.checked,
              }))
            }
          />
        </div>

        {/*<button
          type="button"
          onClick={() => {
            setSettings(DEFAULT_SETTINGS)
            setTargetFps(30)
          }}
        >
          Reset to default
        </button>*/}
        {/*{cameraDescription && <p className='description'>Input: {cameraDescription}</p>}*/}
        {(camera.error || engineError) && (
          <p className="error-message" role="alert">
            {camera.error ?? engineError}
          </p>
        )}
      </aside>
    </main>
  )
}

type RangeControlProps = {
  label: string
  hint: string
  min: number
  max: number
  step: number
  value: number
  displayValue: string
  onChange: (value: number) => void
}

function RangeControl({
  label,
  hint,
  min,
  max,
  step,
  value,
  displayValue,
  onChange,
}: RangeControlProps) {
  const id = `control-${label}`

  return (
    <div className="range-control">
      <div className="control-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{displayValue}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <small id={`${id}-hint`}>{hint}</small>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function getStatusText(
  status: CameraStatus,
  isCalibrating: boolean,
): string {
  if (status === 'requesting') {
    return 'Requesting access'
  }
  if (status === 'suspended') {
    return 'Camera interrupted'
  }
  if (status === 'running' && isCalibrating) {
    return 'Initializing'
  }
  if (status === 'running') {
    return 'Running'
  }
  if (status === 'error') {
    return 'Error'
  }
  return 'Idle'
}
