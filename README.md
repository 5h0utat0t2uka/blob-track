# Blob Track
This is a React application that extracts moving regions from fixed-camera footage and renders blob bounding boxes, center points, IDs, and trajectories on the client side.

## Processing
1. `getUserMedia()`でカメラ映像を取得
2. `requestVideoFrameCallback()`で映像フレームに同期
3. 320×180の解析用Canvasへ縮小
4. Running Background Modelによる背景差分
5. 3×3 openingによる孤立ノイズ除去
6. 8近傍Connected ComponentsによるBlob抽出
7. 距離・IoU・速度予測によるTrackとの1対1関連付け
8. `object-fit: cover`を考慮してOverlay Canvasへ描画

## References
- [Media Capture and Streams](https://w3c.github.io/mediacapture-main/)
- [HTML Standard: video frame callbacks](https://html.spec.whatwg.org/multipage/media.html#video-frame-callbacks)
- [WebKit: `requestVideoFrameCallback()` support](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)
- [WebKit: `willReadFrequently` support](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/#canvas)
- [Vite server options](https://v8.vite.dev/config/server-options)
