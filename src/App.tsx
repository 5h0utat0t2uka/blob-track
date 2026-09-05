import './App.css'
import { Link, Route, Routes } from 'react-router'
import { TrackerView } from './pages/TrackerView.tsx'
import { MediaPipeTrackerPage } from './pages/MediaPipeTrackerPage.tsx'

function App() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="background-subtraction" element={<TrackerView />} />
      <Route path="mediapipe-tasks-vision" element={<MediaPipeTrackerPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

function Home() {
  return (
    <main className='home'>
      <section>
        <h1>Vision Tracker</h1>
        <p>A React demo of browser-based detection and tracking using background subtraction and MediaPipe Tasks Vision Object Detector. Both modes display bounding boxes, center points, track IDs, and motion trails regions. All video processing runs locally in the browser without uploading camera frames.</p>
        <a href="https://github.com/5h0utat0t2uka/blob-track" target="_blank" rel="noopener noreferrer">Repository</a>
        <nav aria-label="Tracking methods">
          <ul>
            <li>
              <Link to="/background-subtraction">Background Subtraction Blob Tracking</Link>
              <span>機械学習モデルを利用せず Background Subtraction（背景差分）を利用した動体検出の実装</span>
            </li>
            <li>
              <Link to="/mediapipe-tasks-vision">MediaPipe Tasks Vision Object Detection Tracking</Link>
              <span>特定のオブジェクトを対象に MediaPipe Tasks Vision の Object Detectorを利用した実装</span>
            </li>
          </ul>
        </nav>
      </section>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className='home'>
      <section>
        <h1>404</h1>
        <Link to="/">Back to home</Link>
      </section>
    </main>
  )
}

export default App
