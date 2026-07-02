const STORAGE_KEY = 'adminNotificationSoundMuted';

let sharedAudioContext = null;

export function isAdminNotificationSoundMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAdminNotificationSoundMuted(muted) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage errors.
  }
}

function getSharedAudioContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContextCtor();
  }
  return sharedAudioContext;
}

/** Call after user enables sound so background playback is allowed. */
export async function unlockAdminNotificationAudio() {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

export async function requestAdminDesktopNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

function playBellOnContext(ctx) {
  const playBellStrike = (frequency, startTime, peakGain = 0.85) => {
    const duration = 0.9;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const harmonic = ctx.createOscillator();
    const harmonicGain = ctx.createGain();

    osc.type = 'sine';
    harmonic.type = 'triangle';

    osc.frequency.setValueAtTime(frequency, startTime);
    harmonic.frequency.setValueAtTime(frequency * 2.02, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    harmonicGain.gain.setValueAtTime(0.0001, startTime);
    harmonicGain.gain.exponentialRampToValueAtTime(peakGain * 0.35, startTime + 0.02);
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.85);

    osc.connect(gain);
    harmonic.connect(harmonicGain);
    gain.connect(ctx.destination);
    harmonicGain.connect(ctx.destination);

    osc.start(startTime);
    harmonic.start(startTime);
    osc.stop(startTime + duration);
    harmonic.stop(startTime + duration);
  };

  const now = ctx.currentTime;
  playBellStrike(784, now, 0.9);
  playBellStrike(988, now + 0.22, 1);
  playBellStrike(1175, now + 0.44, 0.95);
}

export function playAdminNotificationSound() {
  if (isAdminNotificationSoundMuted()) return;

  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playBellOnContext(ctx)).catch(() => {});
      return;
    }

    playBellOnContext(ctx);
  } catch {
    // Autoplay policies or missing audio support — fail silently.
  }
}

export function showAdminDesktopNotification({ title, message, tag } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const body = String(message || '').trim();
  const heading = String(title || 'OTODIAL Admin').trim();

  try {
    const notification = new Notification(heading, {
      body: body || 'New admin notification',
      icon: 'https://otodial.com/assets/otodial-logo-D3kxwFp8.png',
      badge: 'https://otodial.com/assets/otodial-logo-D3kxwFp8.png',
      tag: tag || `otodial-admin-${Date.now()}`,
      silent: false,
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Ignore notification errors.
  }
}

export function alertAdminBellNotification(notification = {}) {
  if (isAdminNotificationSoundMuted()) return;

  playAdminNotificationSound();
  showAdminDesktopNotification({
    title: notification.title || 'OTODIAL Admin',
    message: notification.message || 'You have a new notification',
    tag: notification._id ? `otodial-bell-${notification._id}` : undefined,
  });
}

export async function enableAdminNotificationAlerts() {
  setAdminNotificationSoundMuted(false);
  await unlockAdminNotificationAudio();
  await requestAdminDesktopNotificationPermission();
}
