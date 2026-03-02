import { useEffect, useRef, useState } from "react";
import API from "../../../api";

function SiteSeo() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [doc, setDoc] = useState(null);
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
        setDoc(res.data?.seo || null);
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

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await API.put("/api/admin/site/seo", doc || {});
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

              <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-600 p-4 text-sm text-gray-600 dark:text-gray-300">
                Keyword manager, schema controls, robots/sitemap/redirect tools are wired next; this page already persists metadata safely.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SiteSeo;

