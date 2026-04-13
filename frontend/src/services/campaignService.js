import API from '../api';

export async function listCampaigns() {
  const res = await API.get('/api/campaign');
  if (res.error) throw new Error(res.error);
  return {
    campaigns: res.data?.campaigns || [],
    optOutTotal: res.data?.optOutTotal ?? 0,
  };
}

export async function getCampaign(id) {
  const res = await API.get(`/api/campaign/${id}`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getCampaignAnalytics(id) {
  const res = await API.get(`/api/campaign/${id}/analytics`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function createCampaign({ name, recipients }) {
  const res = await API.post('/api/campaign', { name, recipients });
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to create campaign');
  return res.data;
}

export async function importCampaignCsv(file, name) {
  const fd = new FormData();
  fd.append('file', file);
  if (name) fd.append('name', name);
  const res = await API.post('/api/campaign/import/csv', fd);
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'CSV import failed');
  return res.data;
}

export async function sendCampaign(id, message, options = {}) {
  const body = { message, ...options };
  const res = await API.post(`/api/campaign/${id}/send`, body);
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to start send');
  return res.data;
}

export async function aiGenerateCampaign(payload) {
  const res = await API.post('/api/campaign/ai-generate', payload);
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'AI failed');
  return res.data;
}

export async function previewRender(message, variables) {
  const res = await API.post('/api/campaign/preview-render', { message, variables });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function listTemplates() {
  const res = await API.get('/api/campaign/templates');
  if (res.error) throw new Error(res.error);
  return res.data?.templates || [];
}

export async function createTemplate({ title, content }) {
  const res = await API.post('/api/campaign/templates', { title, content });
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to save template');
  return res.data.template;
}

export async function deleteTemplate(id) {
  const res = await API.delete(`/api/campaign/templates/${id}`);
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to delete');
}

export async function updateTemplate(id, { title, content }) {
  const res = await API.patch(`/api/campaign/templates/${id}`, { title, content });
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to update template');
  return res.data.template;
}

export async function getCampaignRecipients(id, { limit } = {}) {
  const res = await API.get(`/api/campaign/${id}/recipients`, {
    params: limit ? { limit } : undefined,
  });
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to load recipients');
  return res.data.recipients || [];
}

export async function patchUserCampaignMode(campaignMode) {
  const res = await API.patch('/api/users/preferences', { campaignMode });
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to save preference');
  return res.data.preferences;
}

export async function searchCampaignWorkspace(q) {
  const res = await API.get('/api/campaign/search', { params: { q } });
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Search failed');
  return {
    campaigns: res.data.campaigns || [],
    contacts: res.data.contacts || [],
  };
}

export async function getThreadActivity(phone) {
  const res = await API.get('/api/campaign/activity', { params: { phone } });
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to load activity');
  return {
    messages: res.data.messages || [],
    campaigns: res.data.campaigns || [],
  };
}

export async function duplicateCampaign(id) {
  const res = await API.post(`/api/campaign/${id}/duplicate`);
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Duplicate failed');
  return res.data.campaign;
}

export async function patchCampaignDraft(id, { name, messageBody } = {}) {
  const res = await API.patch(`/api/campaign/${id}`, { name, messageBody });
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Save failed');
  return res.data.campaign;
}

export async function getWorkspaceStats() {
  const res = await API.get('/api/campaign/workspace-stats');
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to load stats');
  return res.data;
}

export async function getMessagingAutomation() {
  const res = await API.get('/api/users/messaging-automation');
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to load');
  return res.data.messagingAutomation;
}

export async function patchMessagingAutomation(payload) {
  const res = await API.patch('/api/users/messaging-automation', payload);
  if (res.error) throw new Error(res.error);
  if (!res.data?.success) throw new Error(res.data?.error || 'Save failed');
  return res.data.messagingAutomation;
}

export async function downloadOptOutCsv() {
  const base = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  const token = localStorage.getItem('token');
  const url = base ? `${base}/api/campaign/opt-outs/export` : '/api/campaign/opt-outs/export';
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'opt-outs.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
