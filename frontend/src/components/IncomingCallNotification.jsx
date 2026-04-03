/**
 * Previously rendered a second incoming-call UI on top of GlobalCallOverlay.
 * That stacked two full-screen layers (z-[9999] over z-[70]): the top “Unknown” UI
 * received taps while the real CallWindow underneath looked frozen.
 *
 * Incoming and outbound calls use GlobalCallOverlay (most routes) or ActiveCallChrome in the
 * Recents dialer column (xl+). Kept as a no-op in case anything still imports it.
 */
export default function IncomingCallNotification() {
  return null;
}
