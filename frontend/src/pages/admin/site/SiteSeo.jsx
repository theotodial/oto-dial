import { useEffect, useMemo, useRef, useState } from "react";
import API from "../../../api";

const splitKeywordInput = (raw = "") => {
  const chunks = String(raw || "")
    .split(/[\n,]+/g)
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return Array.from(new Set(chunks)).slice(0, 2000);
};

function SiteSeo() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [doc, setDoc] = useState(null);
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [hiddenKeywordsRaw, setHiddenKeywordsRaw] = useState("");
  const [robotsRaw, setRobotsRaw] = useState("");
  const [redirects, setRedirects] = useState([]);
  const [customJsonLdRaw, setCustomJsonLdRaw] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [notFoundLogs, setNotFoundLogs] = useState([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await API.get("/api/admin/site/seo");
        if (res.error || res.data?.success === false) {
          throw new Error(res.error || res.data?.error || "Failed to load SEO settings");
        }
        if (!isMountedRef.current) return;
        const next = res.data?.seo || null;
        setDoc(next);
        setKeywordsRaw(Array.isArray(next?.keywords) ? next.keywords.join("\n") : "");
        setHiddenKeywordsRaw(Array.isArray(next?.hiddenKeywords) ? next.hiddenKeywords.join("\n") : "");
        setRobotsRaw(String(next?.robotsTxt || ""));
        setRedirects(Array.isArray(next?.redirects) ? next.redirects : []);
        setCustomJsonLdRaw(
          typeof next?.schema?.customJsonLd === "string"
            ? next.schema.customJsonLd
            : next?.schema?.customJsonLd
              ? JSON.stringify(next.schema.customJsonLd, null, 2)
              : ""
        );
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err?.message || "Failed to load SEO settings");
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    };
    load();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateMeta = (key, value) => {
    setDoc((prev) => ({
      ...(prev || {}),
      meta: {
        ...((prev || {}).meta || {}),
        [key]: value
      }
    }));
  };

  const setSchemaField = (key, value) => {
    setDoc((prev) => ({
      ...(prev || {}),
      schema: {
        ...((prev || {}).schema || {}),
        [key]: value
      }
    }));
  };

  const buildPayload = () => {
    const meta = doc?.meta && typeof doc.meta === "object" ? doc.meta : {};
    const schema = doc?.schema && typeof doc.schema === "object" ? doc.schema : {};
    const keywords = splitKeywordInput(keywordsRaw);
    const hiddenKeywords = splitKeywordInput(hiddenKeywordsRaw);
    let customJsonLd = customJsonLdRaw;
    // Keep custom JSON-LD as a string; public runtime can parse.
    if (typeof customJsonLd !== "string") customJsonLd = "";

    return {
      ...doc,
      meta,
      keywords,
      hiddenKeywords,
      robotsTxt: String(robotsRaw || ""),
      redirects: Array.isArray(redirects) ? redirects : [],
      schema: { ...schema, customJsonLd }
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await API.put("/api/admin/site/seo", buildPayload());
      if (res.error || res.data?.success === false) {
        throw new Error(res.error || res.data?.error || "Failed to save SEO settings");
      }
      if (!isMountedRef.current) return;
      setDoc(res.data?.seo || doc);
      setNotice("Saved.");
      setTimeout(() => {
        if (isMountedRef.current) setNotice("");
      }, 1200);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Failed to save SEO settings");
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  const addRedirect = () => {
    setRedirects((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      { from: "/old-path", to: "/new-path", code: 301 }
    ]);
  };

  const updateRedirect = (idx, patch) => {
    setRedirects((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next[idx] = { ...(next[idx] || {}), ...(patch || {}) };
      return next;
    });
  };

  const removeRedirect = (idx) => {
    setRedirects((prev) => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
  };

  const load404Logs = async () => {
    setLogsLoading(true);
    setError("");
    try {
      const res = await API.get("/api/admin/site/seo/404-logs?limit=120");
      if (res.error || res.data?.success === false) {
        throw new Error(res.error || res.data?.error || "Failed to load 404 logs");
      }
      if (!isMountedRef.current) return;
      setNotFoundLogs(res.data?.logs || []);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Failed to load 404 logs");
    } finally {
      if (isMountedRef.current) setLogsLoading(false);
    }
  };

  const keywordsCount = useMemo(() => splitKeywordInput(keywordsRaw).length, [keywordsRaw]);
  const hiddenKeywordsCount = useMemo(
    () => splitKeywordInput(hiddenKeywordsRaw).length,
    [hiddenKeywordsRaw]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading SEO settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Site SEO
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Control metadata, keywords, schema, robots, sitemap, and redirects.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm font-semibold"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-5 p-4 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Homepage Metadata
            </h2>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={doc?.meta?.title || ""}
                  onChange={(e) => updateMeta("title", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Meta description
                </label>
                <textarea
                  value={doc?.meta?.description || ""}
                  onChange={(e) => updateMeta("description", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Canonical URL
                  </label>
                  <input
                    type="url"
                    value={doc?.meta?.canonicalUrl || ""}
                    onChange={(e) => updateMeta("canonicalUrl", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Open Graph image URL
                  </label>
                  <input
                    type="url"
                    value={doc?.meta?.ogImage || ""}
                    onChange={(e) => updateMeta("ogImage", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Open Graph title
                  </label>
                  <input
                    type="text"
                    value={doc?.meta?.ogTitle || ""}
                    onChange={(e) => updateMeta("ogTitle", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Open Graph description
                  </label>
                  <input
                    type="text"
                    value={doc?.meta?.ogDescription || ""}
                    onChange={(e) => updateMeta("ogDescription", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Twitter title
                  </label>
                  <input
                    type="text"
                    value={doc?.meta?.twitterTitle || ""}
                    onChange={(e) => updateMeta("twitterTitle", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Twitter description
                  </label>
                  <input
                    type="text"
                    value={doc?.meta?.twitterDescription || ""}
                    onChange={(e) => updateMeta("twitterDescription", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Keywords
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Primary keywords ({keywordsCount})
                  </label>
                  <button
                    onClick={() => setKeywordsRaw((prev) => `${prev}\n`.trim())}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-300"
                  >
                    Bulk paste supported
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={keywordsRaw}
                  onChange={(e) => setKeywordsRaw(e.target.value)}
                  placeholder="One per line or comma-separated"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Hidden keywords ({hiddenKeywordsCount})
                </label>
                <textarea
                  rows={8}
                  value={hiddenKeywordsRaw}
                  onChange={(e) => setHiddenKeywordsRaw(e.target.value)}
                  placeholder="Not shown on page, but injected into meta tags"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Structured Data (Schema.org)
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={!!doc?.schema?.enableFaqSchema}
                    onChange={(e) => setSchemaField("enableFaqSchema", e.target.checked)}
                  />
                  Enable FAQ schema (auto from FAQ section)
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={!!doc?.schema?.enableReviewSchema}
                    onChange={(e) => setSchemaField("enableReviewSchema", e.target.checked)}
                  />
                  Enable Review schema (auto from testimonials)
                </label>
                <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-600 p-3 text-xs text-gray-600 dark:text-gray-300">
                  If you haven’t added FAQ/Testimonial sections yet, these schemas won’t emit anything.
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Custom JSON-LD (optional)
                </label>
                <textarea
                  rows={8}
                  value={customJsonLdRaw}
                  onChange={(e) => setCustomJsonLdRaw(e.target.value)}
                  placeholder='{"@context":"https://schema.org","@type":"Organization",...}'
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-xs"
                />
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Invalid JSON will be ignored on the public page.
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Technical SEO
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Robots.txt (served via backend; map to domain root in nginx)
                </label>
                <textarea
                  rows={8}
                  value={robotsRaw}
                  onChange={(e) => setRobotsRaw(e.target.value)}
                  placeholder={"User-agent: *\nAllow: /\n"}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-xs"
                />
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Generated endpoints: <span className="font-mono">/api/site/robots.txt</span>,{" "}
                  <span className="font-mono">/api/site/sitemap.xml</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Redirect manager (301/302)
                  </label>
                  <button
                    onClick={addRedirect}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    + Add redirect
                  </button>
                </div>
                <div className="space-y-2">
                  {(redirects || []).slice(0, 50).map((r, idx) => (
                    <div
                      key={`${r.from || "from"}-${idx}`}
                      className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 p-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          value={r.from || ""}
                          onChange={(e) => updateRedirect(idx, { from: e.target.value })}
                          placeholder="/old-path"
                          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-mono"
                        />
                        <input
                          value={r.to || ""}
                          onChange={(e) => updateRedirect(idx, { to: e.target.value })}
                          placeholder="/new-path"
                          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-mono"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={String(r.code || 301)}
                            onChange={(e) => updateRedirect(idx, { code: Number(e.target.value) })}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                          >
                            <option value="301">301</option>
                            <option value="302">302</option>
                          </select>
                          <button
                            onClick={() => removeRedirect(idx)}
                            className="px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800 text-sm font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {redirects?.length > 50 && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Showing first 50 redirects.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                404 Monitoring (API)
              </h2>
              <button
                onClick={load404Logs}
                disabled={logsLoading}
                className="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-100 text-sm font-semibold disabled:opacity-50"
              >
                {logsLoading ? "Loading..." : "Refresh logs"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-4">Path</th>
                    <th className="py-2 pr-4">Method</th>
                    <th className="py-2 pr-4">Count</th>
                    <th className="py-2">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {(notFoundLogs || []).slice(0, 120).map((row) => (
                    <tr key={`${row.method}-${row.path}`} className="text-gray-800 dark:text-gray-200">
                      <td className="py-2 pr-4 font-mono text-xs">{row.path}</td>
                      <td className="py-2 pr-4">{row.method}</td>
                      <td className="py-2 pr-4">{row.count}</td>
                      <td className="py-2 text-xs text-gray-500 dark:text-gray-400">
                        {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                  {(!notFoundLogs || notFoundLogs.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        No logs yet. This tracks backend-side `/api/*` 404s.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SiteSeo;

