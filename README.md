# Blob Track
This is a React application that extracts moving regions from fixed-camera footage and renders blob bounding boxes, center points, IDs, and trajectories on the client side.

## features
- Web APIのみでリアルタイムなカメラ解析
- ブラウザのみで動作してインストール不要
- 映像を外部に送信せず端末内で完結
- 機械学習モデルが不要で軽量
- ハードウェア（内臓・外部カメラ）に依存しない
- 以下のような映像解析の用途に利用可能
  - 滞在・活動量の可視化 
  - 動線・ヒートマップ生成
  - 

## Implement
1. `getUserMedia()`でカメラ映像を取得
2. `requestVideoFrameCallback()`で映像フレームに同期
3. 元映像の縦横比を保ち、長辺320px以下の解析用Canvasへ縮小（横長320×180、縦長180×320など）
4. Running Background Modelによる背景差分
5. 3×3 openingによる孤立ノイズ除去
6. 8近傍Connected ComponentsによるBlob抽出
7. 距離・IoU・速度予測によるTrackとの1対1関連付け
8. `object-fit: cover`を考慮してOverlay Canvasへ描画

## References
- [Media Capture and Streams](https://w3c.github.io/mediacapture-main/)
- [Video frame callbacks specification](https://wicg.github.io/video-rvfc/)
- [HTML Standard: video dimensions](https://html.spec.whatwg.org/multipage/media.html#dom-video-videowidth)
- [WebKit: `requestVideoFrameCallback()` support](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)
- [WebKit: `willReadFrequently` support](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/#canvas)
- [Vite server options](https://v8.vite.dev/config/server-options)
