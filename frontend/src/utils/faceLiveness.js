import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as faceapi from '@vladmandic/face-api';

const MODEL_BASE = '/face-api-model';

const LIVE_DETECTOR = new faceapi.TinyFaceDetectorOptions({
  inputSize: 512,
  scoreThreshold: 0.3,
});

const FULL_DETECTOR = new faceapi.SsdMobilenetv1Options({
  minConfidence: 0.4,
  maxResults: 1,
});

let modelsLoaded = false;
let modelsLoading = null;
let tfReady = false;

async function ensureTensorflow() {
  if (tfReady) return;
  try {
    await tf.setBackend('webgl');
    await tf.ready();
  } catch {
    await tf.setBackend('cpu');
    await tf.ready();
  }
  tfReady = true;
}

export async function loadFaceModels(onProgress) {
  if (modelsLoaded) return true;
  if (modelsLoading) return modelsLoading;

  modelsLoading = (async () => {
    try {
      onProgress?.('Initializing AI engine…');
      await ensureTensorflow();

      onProgress?.('Loading live face tracker…');
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_BASE);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_BASE);

      onProgress?.('Loading recognition models…');
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_BASE);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_BASE);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE);
      modelsLoaded = true;
      return true;
    } catch (err) {
      modelsLoading = null;
      throw err;
    }
  })();

  return modelsLoading;
}

function avgPoint(points) {
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Yaw proxy from landmarks — positive ≈ user turned left. */
export function estimateHeadYaw(landmarks) {
  if (!landmarks?.getLeftEye || !landmarks?.getRightEye) return 0;
  const leftEye = avgPoint(landmarks.getLeftEye());
  const rightEye = avgPoint(landmarks.getRightEye());
  const nose = landmarks.getNose()?.[3] || landmarks.getNose()?.[0];
  if (!nose) return 0;
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeDist = Math.abs(rightEye.x - leftEye.x) || 1;
  return (nose.x - eyeMidX) / eyeDist;
}

const OVAL_CENTER_X = 0.5;
const OVAL_CENTER_Y = 0.42;

export function analyzeFace(detection, videoWidth, videoHeight) {
  if (!detection?.detection?.box) {
    return {
      detected: false,
      centered: false,
      sizeOk: false,
      tooSmall: false,
      tooLarge: false,
      yaw: 0,
      confidence: 0,
    };
  }

  const box = detection.detection.box;
  const landmarks = detection.landmarks;
  const yaw = estimateHeadYaw(landmarks);
  const confidence = Math.round((detection.detection.score || 0) * 100);

  const faceCenterX = box.x + box.width / 2;
  const faceCenterY = box.y + box.height / 2;
  const targetX = videoWidth * OVAL_CENTER_X;
  const targetY = videoHeight * OVAL_CENTER_Y;

  const dx = Math.abs(faceCenterX - targetX) / videoWidth;
  const dy = Math.abs(faceCenterY - targetY) / videoHeight;
  const centered = dx < 0.18 && dy < 0.2;

  const widthRatio = box.width / videoWidth;
  const tooSmall = widthRatio < 0.16;
  const tooLarge = widthRatio > 0.78;
  const sizeOk = !tooSmall && !tooLarge;

  return {
    detected: true,
    centered,
    sizeOk,
    tooSmall,
    tooLarge,
    yaw,
    confidence,
    box,
    videoWidth,
    videoHeight,
  };
}

/** Fast path for live camera — tiny detector + tiny landmarks. */
export async function detectFaceLive(source) {
  return faceapi
    .detectSingleFace(source, LIVE_DETECTOR)
    .withFaceLandmarks(true);
}

/** High-accuracy path for capture + ID matching. */
export async function detectFaceFull(source) {
  return faceapi
    .detectSingleFace(source, FULL_DETECTOR)
    .withFaceLandmarks()
    .withFaceDescriptor();
}

export function faceMatchScore(descriptorA, descriptorB) {
  if (!descriptorA || !descriptorB) return null;
  const distance = faceapi.euclideanDistance(descriptorA, descriptorB);
  const score = Math.round(Math.max(0, Math.min(100, (1 - distance / 0.75) * 100)));
  const passed = distance < 0.55;
  return { score, passed, distance };
}

export async function descriptorFromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
  const img = await faceapi.fetchImage(dataUrl);
  const detection = await detectFaceFull(img);
  return detection?.descriptor || null;
}

export function isImageDataUrl(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image');
}

export function createLivenessSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `lv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const LIVENESS_CHALLENGES = [
  {
    id: 'center',
    title: 'Center your face',
    hint: 'Align your face inside the oval and look at the camera.',
    validate: (m) => m.detected && m.centered && m.sizeOk && Math.abs(m.yaw) < 0.18,
  },
  {
    id: 'turn_left',
    title: 'Turn head left',
    hint: 'Slowly turn your head to your left.',
    validate: (m) => m.detected && m.yaw > 0.14,
  },
  {
    id: 'turn_right',
    title: 'Turn head right',
    hint: 'Slowly turn your head to your right.',
    validate: (m) => m.detected && m.yaw < -0.14,
  },
  {
    id: 'hold',
    title: 'Hold still',
    hint: 'Look straight at the camera while we capture a secure live frame.',
    validate: (m) =>
      m.detected && m.centered && m.sizeOk && Math.abs(m.yaw) < 0.15 && m.confidence >= 65,
  },
];

export const FRAMES_REQUIRED = 10;

export async function imageFromDataUrl(dataUrl) {
  if (!dataUrl) return null;
  return faceapi.fetchImage(dataUrl);
}

export function getChallengeFeedback(metrics, challengeId) {
  if (!metrics?.detected) {
    return 'No face detected — move into frame with good lighting.';
  }
  if (metrics.tooSmall) return 'Move a little closer to the camera.';
  if (metrics.tooLarge) return 'Move slightly back from the camera.';
  if (challengeId === 'center' || challengeId === 'hold') {
    if (!metrics.centered) return 'Center your face inside the oval.';
    if (Math.abs(metrics.yaw) >= 0.15) return 'Look straight at the camera.';
  }
  if (challengeId === 'turn_left' && metrics.yaw <= 0.14) {
    return 'Turn your head a bit more to the left.';
  }
  if (challengeId === 'turn_right' && metrics.yaw >= -0.14) {
    return 'Turn your head a bit more to the right.';
  }
  if (challengeId === 'hold' && metrics.confidence < 65) {
    return 'Improve lighting so your face is clearly visible.';
  }
  return null;
}
