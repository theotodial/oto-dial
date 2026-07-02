export function isCameraSupported() {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function getCameraErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission was denied. Open your browser site settings, allow camera access for this site, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was detected on this device. Connect a webcam or use a device with a front camera.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your camera could not be started — it may be in use by another app (Zoom, Teams, etc.). Close those apps and try again.';
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return 'Camera access requires a secure connection. Open OTODIAL on https:// or http://localhost (not a LAN IP).';
  }
  if (name === 'OverconstrainedError') {
    return 'Your camera does not support the requested mode. We will retry with default settings.';
  }
  return err?.message || 'Could not access the camera.';
}

const CONSTRAINT_ATTEMPTS = [
  { video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
  { video: { facingMode: 'user' }, audio: false },
  { video: true, audio: false },
];

export async function openUserCamera() {
  if (!isCameraSupported()) {
    throw Object.assign(new Error('Camera API is not available in this browser.'), {
      name: 'NotSupportedError',
    });
  }

  let lastError = null;
  for (const constraints of CONSTRAINT_ATTEMPTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        throw err;
      }
    }
  }
  throw lastError || new Error('Could not open camera');
}

export async function attachStreamToVideo(stream, videoEl) {
  if (!videoEl) {
    throw new Error('Camera preview is not ready. Please try again.');
  }
  videoEl.srcObject = stream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  try {
    await videoEl.play();
  } catch (err) {
    // Some browsers need a second attempt after metadata loads.
    await new Promise((resolve, reject) => {
      const onReady = () => {
        videoEl.removeEventListener('loadedmetadata', onReady);
        videoEl.play().then(resolve).catch(reject);
      };
      videoEl.addEventListener('loadedmetadata', onReady);
      setTimeout(() => {
        videoEl.removeEventListener('loadedmetadata', onReady);
        videoEl.play().then(resolve).catch(reject);
      }, 1500);
    });
  }
}
