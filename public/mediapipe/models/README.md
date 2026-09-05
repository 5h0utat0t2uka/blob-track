# MediaPipe models

`efficientdet-lite0-int8-v1.tflite` is the EfficientDet-Lite0 int8 v1 model published by Google for MediaPipe Object Detector.

- Source: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite
- SHA-256 (SRI): `sha256-ByC/JHvXbmWU6ij6nG98UkK+d0gYmX277/xNpGDHI7s=`
- SHA-256 (hex): `0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb`
- Input size: 320 x 320
- Model documentation: https://developers.google.com/edge/mediapipe/solutions/vision/object_detector#efficientdet-lite0_model_recommended

The model is intentionally committed so development and production builds do not depend on a runtime CDN. Update the versioned filename, source URL, hash, and the exact exclusion in `nix/pre-commit.nix` together.
