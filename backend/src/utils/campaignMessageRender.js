/**
 * Personalization: {{variableName}} in templates.
 */
export function renderMessage(template, variables = {}) {
  if (template == null) return "";
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const k = String(key || "").trim();
    if (!k) return "";
    const v = variables[k];
    return v != null && v !== "" ? String(v) : "";
  });
}

export function extractTemplateKeys(template) {
  if (!template) return [];
  const keys = new Set();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(template))) !== null) {
    const k = String(m[1] || "").trim();
    if (k) keys.add(k);
  }
  return [...keys];
}

export function findMissingVariables(template, variables = {}) {
  const keys = extractTemplateKeys(template);
  return keys.filter((k) => variables[k] == null || variables[k] === "");
}
