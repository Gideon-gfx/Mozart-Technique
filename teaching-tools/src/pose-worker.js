import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
let detector;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(data.wasm);
      const options = { baseOptions: { modelAssetPath: data.model, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: data.people };
      let backend = 'GPU';
      try { detector = await PoseLandmarker.createFromOptions(files, options); }
      catch { options.baseOptions.delegate = 'CPU'; backend = 'CPU'; detector = await PoseLandmarker.createFromOptions(files, options); }
      self.postMessage({ type: 'ready', backend, connections: PoseLandmarker.POSE_CONNECTIONS });
    } else if (data.type === 'frame') {
      try { const result = detector.detectForVideo(data.bitmap, data.time); self.postMessage({ type: 'result', landmarks: result.landmarks }); }
      finally { data.bitmap.close(); }
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
