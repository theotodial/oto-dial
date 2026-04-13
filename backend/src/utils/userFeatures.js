/**
 * Per-user product flags. Legacy users may omit `features`; defaults preserve Voice on, Campaign off.
 */
export function normalizeFeatures(userLike) {
  const raw = userLike?.features;
  const voiceEnabled =
    raw?.voiceEnabled === undefined || raw?.voiceEnabled === null
      ? true
      : Boolean(raw.voiceEnabled);
  const campaignEnabled = Boolean(raw?.campaignEnabled);
  return { voiceEnabled, campaignEnabled };
}

export function featuresMatchMiddleware(userLike, key) {
  const f = normalizeFeatures(userLike);
  if (key === "voice") return f.voiceEnabled;
  if (key === "campaign") return f.campaignEnabled;
  return false;
}
