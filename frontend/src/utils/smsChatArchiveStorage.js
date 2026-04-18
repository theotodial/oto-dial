const storageKey = (userId) => `otodial_sms_archived_${String(userId || 'anon')}`;

function norm(n) {
  return String(n || '').replace(/\D/g, '');
}

export function loadArchivedPhones(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function archiveSmsChat(userId, phone) {
  const raw = String(phone || '').trim();
  if (!raw) return loadArchivedPhones(userId);
  const list = loadArchivedPhones(userId);
  const n = norm(raw);
  if (!n) return list;
  if (!list.some((p) => norm(p) === n)) {
    const next = [...list, raw];
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
    return next;
  }
  return list;
}

export function unarchiveSmsChat(userId, phone) {
  const n = norm(phone);
  const next = loadArchivedPhones(userId).filter((p) => norm(p) !== n);
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
  return next;
}
