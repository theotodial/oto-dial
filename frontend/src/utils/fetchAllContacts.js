import API from '../api';

/** Load all contact pages (max 50 per request, server-enforced). */
export async function fetchAllContacts(maxPages = 40) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await API.get('/api/contacts', { params: { page, limit: 50 } });
    if (res.error) break;
    const batch = res.data?.contacts || [];
    all.push(...batch);
    const pages = res.data?.pagination?.pages ?? 1;
    if (page >= pages || batch.length === 0) break;
  }
  return all;
}
