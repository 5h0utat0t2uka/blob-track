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
  // const cameraDescription = camera.info
  //   ? [
  //       camera.info.width && camera.info.height
  //         ? `${camera.info.width}×${camera.info.height}`
  //         : null,
  //       camera.info.frameRate
  //         ? `${camera.info.frameRate.toFixed(0)} fps`
  //         : null,
  //       camera.info.facingMode ?? null,
  //     ]
  //       .filter(Boolean)
  //       .join(' / ')
  //   : null

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

        {camera.status !== 'running' && (
          <div className="stage-placeholder">
            <p>右上のアイコンからカメラを開始</p>
            <span>映像と解析は端末内のみで処理され外部への送信はありません</span>
          </div>
        )}

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
          <a href="https://github.com/5h0utat0t2uka/blob-track" target="_blank" rel="noopener noreferrer">Blob tracker:</a>
          <p aria-live="polite">{statusText}</p>
        </div>
        <button
          type="button"
          popoverTarget="tracking-settings"
          aria-label="Settings"
        >
          <svg width={24} height={24} viewBox="-5 -7 24 24"><path fill="currentColor" d="M1 0h5a1 1 0 1 1 0 2H1a1 1 0 1 1 0-2m7 8h5a1 1 0 0 1 0 2H8a1 1 0 1 1 0-2M1 4h12a1 1 0 0 1 0 2H1a1 1 0 1 1 0-2"></path></svg>
        </button>
        {camera.status === 'running' || camera.status === 'suspended' || camera.status === 'requesting' ? (
          <button
            type="button"
            onClick={camera.stop}
            aria-label="Abort"
          >
            <svg width={24} height={24} viewBox="0 0 24 24"><path fill="currentColor" d="M10.713 14.713Q11 14.425 11 14v-4q0-.425-.288-.712T10 9t-.712.288T9 10v4q0 .425.288.713T10 15t.713-.288m4 0Q15 14.426 15 14v-4q0-.425-.288-.712T14 9t-.712.288T13 10v4q0 .425.288.713T14 15t.713-.288M12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12q0-.8.125-1.6T2.5 8.825q.125-.4.513-.537t.737.062q.375.2.538.588t.037.812q-.15.55-.238 1.113T4 12q0 3.35 2.325 5.675T12 20t5.675-2.325T20 12t-2.325-5.675T12 4q-.6 0-1.187.087T9.65 4.35q-.425.125-.8-.025T8.3 3.8t-.013-.762t.563-.513q.75-.275 1.55-.4T12 2q2.075 0 3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22M4.438 6.563Q4 6.125 4 5.5t.438-1.062T5.5 4t1.063.438T7 5.5t-.437 1.063T5.5 7t-1.062-.437M12 12"></path></svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void camera.start()}
            aria-label="Start"
          >
              <svg width={24} height={24} viewBox="0 0 24 24"><path fill="currentColor" d="m10.775 15.475l4.6-3.05q.225-.15.225-.425t-.225-.425l-4.6-3.05q-.25-.175-.513-.038T10 8.926v6.15q0 .3.263.438t.512-.038M12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12q0-.8.125-1.6T2.5 8.825q.125-.4.513-.537t.737.062q.375.2.538.588t.037.812q-.15.55-.238 1.113T4 12q0 3.35 2.325 5.675T12 20t5.675-2.325T20 12t-2.325-5.675T12 4q-.6 0-1.187.087T9.65 4.35q-.425.125-.8-.025T8.3 3.8t-.013-.762t.563-.513q.75-.275 1.55-.4T12 2q2.075 0 3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22M4.438 6.563Q4 6.125 4 5.5t.438-1.062T5.5 4t1.063.438T7 5.5t-.437 1.063T5.5 7t-1.062-.437M12 12"></path></svg>
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

        <div className="control-list">
          <RangeControl
            label="Motion threshold"
            hint="小さいほどわずかな変化も検出"
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
            hint="小さいほど小さな動体を検出"
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
            hint="小さいほど変化へ速く適応"
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
    return 'Initialize'
  }
  if (status === 'running') {
    return 'Running'
  }
  if (status === 'error') {
    return 'Error'
  }
  return 'Idle'
}
