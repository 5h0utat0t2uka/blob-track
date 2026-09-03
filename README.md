# Blob Track

固定カメラの映像から動いている領域を抽出し、Blobの矩形・中心点・ID・軌道を端末上で描画するReactアプリです。カメラ映像や解析結果を外部へ送信・保存しません。

対象環境はSafari 26.6 / iOS 26.6 / macOS Tahoe 26.6です。

## 処理構成

1. `getUserMedia()`でカメラ映像を取得
2. `requestVideoFrameCallback()`で映像フレームに同期
3. 320×180の解析用Canvasへ縮小
4. Running Background Modelによる背景差分
5. 3×3 openingによる孤立ノイズ除去
6. 8近傍Connected ComponentsによるBlob抽出
7. 距離・IoU・速度予測によるTrackとの1対1関連付け
8. `object-fit: cover`を考慮してOverlay Canvasへ描画

React stateはカメラ状態・設定・低頻度の計測表示にだけ使用し、フレームごとの画像・マスク・TrackはReact外の処理クラスで管理します。

## 開発

Node.jsとpnpmは[`nix/fixed-node.nix`](./nix/fixed-node.nix)で固定されています。

```bash
nix develop
pnpm dev
```

macOS上の`localhost`以外からカメラを使用する場合はHTTPSが必要です。iPhoneからLAN経由で確認する場合は、iPhoneから信頼される証明書を設定したHTTPS環境、またはHTTPSのプレビューデプロイを使用してください。単にViteへ`--host`を指定するだけではHTTPSにはなりません。

## 検証

```bash
pnpm test
pnpm build
pnpm check:pre-commit
```

テストはNixで固定されたNode.jsのTypeScript実行機能を使用するため、追加のテストライブラリは必要ありません。

## 現在の制約

- 固定カメラが前提です。カメラ自体が動くと画面全体が動体として扱われます。
- Connected Components上で複数の対象が1つのBlobに結合した場合、個体を確実には識別できません。
- 交差、長時間の遮蔽、高速移動ではIDが入れ替わる可能性があります。
- 30 fpsでの動作は端末性能・温度・撮影条件に依存します。画面上の処理時間を確認し、必要に応じて20または15 fpsを選択してください。

## 仕様資料

- [Media Capture and Streams](https://w3c.github.io/mediacapture-main/)
- [HTML Standard: video frame callbacks](https://html.spec.whatwg.org/multipage/media.html#video-frame-callbacks)
- [WebKit: `requestVideoFrameCallback()` support](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)
- [WebKit: `willReadFrequently` support](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/#canvas)
- [Vite server options](https://v8.vite.dev/config/server-options)
