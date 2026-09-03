import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'running' | 'error'

type CameraInfo = {
  width?: number
  height?: number
  frameRate?: number
  facingMode?: string
}

type CameraState = {
  status: CameraStatus
  error: string | null
  info: CameraInfo | null
}

const INITIAL_STATE: CameraState = {
  status: 'idle',
  error: null,
  info: null,
}

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const streamRef = useRef<MediaStream | null>(null)
  const requestIdRef = useRef(0)
  const [state, setState] = useState<CameraState>(INITIAL_STATE)

  const releaseStream = useCallback(() => {
    const stream = streamRef.current

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [videoRef])

  const stop = useCallback(() => {
    requestIdRef.current += 1
    releaseStream()
    setState(INITIAL_STATE)
  }, [releaseStream])

  const start = useCallback(async () => {
    const video = videoRef.current

    if (!video) {
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        status: 'error',
        error: 'このブラウザではカメラを利用できません。HTTPS接続を確認してください。',
        info: null,
      })
      return
    }

    requestIdRef.current += 1
    const requestId = requestIdRef.current
    releaseStream()
    setState({ status: 'requesting', error: null, info: null })

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      })

      if (requestId !== requestIdRef.current) {
        for (const track of stream.getTracks()) {
          track.stop()
        }
        return
      }

      streamRef.current = stream
      video.srcObject = stream
      await video.play()

      const settings = stream.getVideoTracks()[0]?.getSettings()
      setState({
        status: 'running',
        error: null,
        info: settings
          ? {
              width: settings.width,
              height: settings.height,
              frameRate: settings.frameRate,
              facingMode: settings.facingMode,
            }
          : null,
      })
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return
      }

      releaseStream()
      setState({
        status: 'error',
        error: cameraErrorMessage(error),
        info: null,
      })
    }
  }, [releaseStream, videoRef])

  useEffect(() => {
    const handlePageHide = () => {
      requestIdRef.current += 1
      releaseStream()
      setState(INITIAL_STATE)
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      requestIdRef.current += 1
      releaseStream()
    }
  }, [releaseStream])

  return {
    ...state,
    start,
    stop,
  }
}

function cameraErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return 'カメラの開始中に予期しないエラーが発生しました。'
  }

  switch (error.name) {
    case 'NotAllowedError':
      return 'カメラへのアクセスが許可されていません。ブラウザのサイト設定を確認してください。'
    case 'NotFoundError':
      return '利用可能なカメラが見つかりません。'
    case 'NotReadableError':
      return 'カメラを開始できませんでした。他のアプリが使用していないか確認してください。'
    case 'OverconstrainedError':
      return 'カメラが要求された撮影条件に対応していません。'
    case 'AbortError':
      return 'カメラの開始が中断されました。もう一度お試しください。'
    default:
      return 'カメラを開始できませんでした。ブラウザの権限と接続環境を確認してください。'
  }
}
