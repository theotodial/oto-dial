const storageKey = (userId) => `otodial_sms_favorites_${String(userId || "anon")}`;

export function loadSmsFavorites(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addSmsFavorite(userId, { text, peerPhone }) {
  const body = String(text || "").trim();
  if (!body) return loadSmsFavorites(userId);

  const list = loadSmsFavorites(userId);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const entry = {
    id,
    text: body,
    peerPhone: String(peerPhone || "").trim(),
    savedAt: new Date().toISOString(),
  };
  const next = [entry, ...list].slice(0, 200);
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
  return next;
}

export function removeSmsFavorite(userId, id) {
  const list = loadSmsFavorites(userId).filter((x) => x.id !== id);
  localStorage.setItem(storageKey(userId), JSON.stringify(list));
  return list;
}
