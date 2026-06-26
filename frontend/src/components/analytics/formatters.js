export const formatNumber = (n) => {
  const num = Number(n || 0);
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

export const formatFull = (n) => Number(n || 0).toLocaleString();

export const formatCurrency = (n) => {
  const num = Number(n || 0);
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 10_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

export const formatPercent = (n) => `${Number(n || 0).toFixed(1)}%`;

export const formatDuration = (seconds) => {
  const s = Math.round(Number(seconds || 0));
  if (s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
};

export const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6'
];

export const channelLabel = (channel) => {
  const map = {
    direct: 'Direct',
    organic_search: 'Organic Search',
    paid: 'Paid',
    social: 'Social',
    referral: 'Referral',
    email: 'Email',
    internal: 'Internal'
  };
  return map[channel] || (channel || 'Unknown');
};

export const sourceIcon = (source) => {
  const key = String(source || '').toLowerCase();
  if (key.includes('snapchat')) return '\u{1F47B}';
  if (key.includes('instagram')) return '\u{1F4F8}';
  if (key.includes('facebook')) return '\u{1F4D8}';
  if (key === 'x' || key.includes('twitter')) return '\u{1D54F}';
  if (key.includes('tiktok')) return '\u{1F3B5}';
  if (key.includes('linkedin')) return '\u{1F4BC}';
  if (key.includes('youtube')) return '\u{25B6}';
  if (key.includes('reddit')) return '\u{1F47D}';
  if (key.includes('producthunt')) return '\u{1F431}';
  if (key.includes('github')) return '\u{1F431}';
  if (key.includes('google')) return '\u{1F50E}';
  if (key.includes('direct')) return '\u{1F517}';
  return '\u{1F310}';
};
