import './App.css'
import { Link, Route, Routes } from 'react-router'
import { BackgroundSubtractionBlobTracker } from './routes/background-subtraction'
import { MediaPipeTasksVisionObjectTracker } from './routes/mediapipe-tasks-vision'

function App() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="background-subtraction" element={<BackgroundSubtractionBlobTracker />} />
      <Route path="mediapipe-tasks-vision" element={<MediaPipeTasksVisionObjectTracker />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

function Home() {
  return (
    <main className='home'>
      <section>
        <h1>Vision Tracker</h1>
        <p>A React demo of browser-based detection and tracking using background subtraction and MediaPipe Tasks Vision Object Detector. <br/>All video processing runs locally in the browser without uploading camera frames.</p>
        <a href="https://github.com/5h0utat0t2uka/vision-tracker" target="_blank" rel="noopener noreferrer">
          <svg width={128} height={128} viewBox="0 0 128 128"><path fill="#f34f29" d="M124.737 58.378L69.621 3.264c-3.172-3.174-8.32-3.174-11.497 0L46.68 14.71l14.518 14.518c3.375-1.139 7.243-.375 9.932 2.314c2.703 2.706 3.461 6.607 2.294 9.993l13.992 13.993c3.385-1.167 7.292-.413 9.994 2.295c3.78 3.777 3.78 9.9 0 13.679a9.673 9.673 0 0 1-13.683 0a9.68 9.68 0 0 1-2.105-10.521L68.574 47.933l-.002 34.341a9.7 9.7 0 0 1 2.559 1.828c3.778 3.777 3.778 9.898 0 13.683c-3.779 3.777-9.904 3.777-13.679 0c-3.778-3.784-3.778-9.905 0-13.683a9.7 9.7 0 0 1 3.167-2.11V47.333a9.6 9.6 0 0 1-3.167-2.111c-2.862-2.86-3.551-7.06-2.083-10.576L41.056 20.333L3.264 58.123a8.133 8.133 0 0 0 0 11.5l55.117 55.114c3.174 3.174 8.32 3.174 11.499 0l54.858-54.858a8.135 8.135 0 0 0-.001-11.501"></path></svg>
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
        <div className='privacy'>
          <svg width={24} height={24} viewBox="0 0 24 24"><g fill="none"><path fill="url(#SVGqgUHFcHw)" d="M3 5.75A.75.75 0 0 1 3.75 5c2.663 0 5.258-.943 7.8-2.85a.75.75 0 0 1 .9 0C14.992 4.057 17.587 5 20.25 5a.75.75 0 0 1 .75.75V11c0 5.001-2.958 8.676-8.725 10.948a.75.75 0 0 1-.55 0C5.958 19.676 3 16 3 11z"></path><path fill="url(#SVG4ljmadFG)" fillOpacity={0.5} d="M3 5.75A.75.75 0 0 1 3.75 5c2.663 0 5.258-.943 7.8-2.85a.75.75 0 0 1 .9 0C14.992 4.057 17.587 5 20.25 5a.75.75 0 0 1 .75.75V11c0 5.001-2.958 8.676-8.725 10.948a.75.75 0 0 1-.55 0C5.958 19.676 3 16 3 11z"></path><path fill="url(#SVGHAkkzelU)" d="M17.5 12a5.5 5.5 0 1 1 0 11a5.5 5.5 0 0 1 0-11"></path><path fill="url(#SVGUi1AWdea)" fillRule="evenodd" d="M20.854 15.146a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708 0l-2-2a.5.5 0 0 1 .708-.708l1.646 1.647l3.646-3.647a.5.5 0 0 1 .708 0" clipRule="evenodd"></path><defs><radialGradient id="SVGqgUHFcHw" cx={0} cy={0} r={1} gradientTransform="rotate(54.497 6.945 -8.578)scale(47.5993 42.0478)" gradientUnits="userSpaceOnUse"><stop offset={0.338} stopColor="#0fafff"></stop><stop offset={0.529} stopColor="#367af2"></stop><stop offset={0.682} stopColor="#5750e2"></stop><stop offset={0.861} stopColor="#cc23d1"></stop></radialGradient><radialGradient id="SVG4ljmadFG" cx={0} cy={0} r={1} gradientTransform="matrix(0 8.125 -8.35714 0 17.786 18.875)" gradientUnits="userSpaceOnUse"><stop offset={0.5} stopColor="#1e1868"></stop><stop offset={1} stopColor="#1e1868" stopOpacity={0}></stop></radialGradient><linearGradient id="SVGHAkkzelU" x1={12.393} x2={19.984} y1={14.063} y2={21.95} gradientUnits="userSpaceOnUse"><stop stopColor="#52d17c"></stop><stop offset={1} stopColor="#22918b"></stop></linearGradient><linearGradient id="SVGUi1AWdea" x1={15.313} x2={16.45} y1={15.51} y2={21.13} gradientUnits="userSpaceOnUse"><stop stopColor="#fff"></stop><stop offset={1} stopColor="#e3ffd9"></stop></linearGradient></defs></g></svg>
          <p>映像の解析は端末内で処理され、外部には何も送信されません。</p>
        </div>
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
