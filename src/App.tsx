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
        <a href="https://github.com/5h0utat0t2uka/vision-tracker" target="_blank" rel="noopener noreferrer">
          <svg xmlns="http://www.w3.org/2000/svg" width={128} height={128} viewBox="0 0 128 128"><path fill="#f34f29" d="M124.737 58.378L69.621 3.264c-3.172-3.174-8.32-3.174-11.497 0L46.68 14.71l14.518 14.518c3.375-1.139 7.243-.375 9.932 2.314c2.703 2.706 3.461 6.607 2.294 9.993l13.992 13.993c3.385-1.167 7.292-.413 9.994 2.295c3.78 3.777 3.78 9.9 0 13.679a9.673 9.673 0 0 1-13.683 0a9.68 9.68 0 0 1-2.105-10.521L68.574 47.933l-.002 34.341a9.7 9.7 0 0 1 2.559 1.828c3.778 3.777 3.778 9.898 0 13.683c-3.779 3.777-9.904 3.777-13.679 0c-3.778-3.784-3.778-9.905 0-13.683a9.7 9.7 0 0 1 3.167-2.11V47.333a9.6 9.6 0 0 1-3.167-2.111c-2.862-2.86-3.551-7.06-2.083-10.576L41.056 20.333L3.264 58.123a8.133 8.133 0 0 0 0 11.5l55.117 55.114c3.174 3.174 8.32 3.174 11.499 0l54.858-54.858a8.135 8.135 0 0 0-.001-11.501"></path></svg>
          Repository
        </a>
        <nav aria-label="Tracking methods">
          <ul>
            <li>
              <Link to="/background-subtraction">Background Subtraction Blob Tracking</Link>
              <span>学習モデル・AIを利用せず Background Subtraction（背景差分）を利用した素朴な動体検出の実装</span>
            </li>
            <li>
              <Link to="/mediapipe-tasks-vision">MediaPipe Tasks Vision Object Detection Tracking</Link>
              <span>量子化済みモデルを利用して特定のオブジェクトを対象に MediaPipe Tasks Vision を利用した実装</span>
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
        <Link to="/">← Back to home</Link>
      </section>
    </main>
  )
}

export default App
