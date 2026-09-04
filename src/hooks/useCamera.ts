import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { CameraSession, IDLE_CAMERA_STATE } from '../camera/CameraSession.ts'

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const sessionRef = useRef<CameraSession | null>(null)
  const [state, setState] = useState(IDLE_CAMERA_STATE)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const session = new CameraSession(video, setState)
    sessionRef.current = session
    const handlePageHide = () => session.stop()
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      session.dispose()
      sessionRef.current = null
    }
  }, [videoRef])

  const start = useCallback(async () => {
    await sessionRef.current?.start()
  }, [])
  const stop = useCallback(() => {
    sessionRef.current?.stop()
  }, [])

  return { ...state, start, stop }
}
