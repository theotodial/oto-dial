export function renderMessage(template, variables = {}) {
  if (template == null) return '';
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const k = String(key || '').trim();
    if (!k) return '';
    const v = variables[k];
    return v != null && v !== '' ? String(v) : '';
  });
}

export function extractTemplateKeys(template) {
  if (!template) return [];
  const keys = new Set();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(template))) !== null) {
    const k = String(m[1] || '').trim();
    if (k) keys.add(k);
  }
  return [...keys];
}

export function findMissingKeys(template, variables = {}) {
  return extractTemplateKeys(template).filter((k) => variables[k] == null || variables[k] === '');
}

/** Rough GSM / Unicode SMS segment count for UI hints */
export function smsSegmentCount(text) {
  const s = String(text || '');
  const chars = [...s].length;
  if (chars === 0) return { chars: 0, segments: 0, encoding: 'GSM-7' };
  const hasUnicode = /[^\x00-\x7F]/.test(s);
  if (!hasUnicode) {
    const segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
    return { chars, segments, encoding: 'GSM-7' };
  }
  const segments = chars <= 70 ? 1 : Math.ceil(chars / 67);
  return { chars, segments, encoding: 'Unicode' };
}
