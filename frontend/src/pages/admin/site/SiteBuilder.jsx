import { useEffect, useMemo, useRef, useState } from "react";
import API from "../../../api";

const DEFAULT_VIEWPORT = "desktop";

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="h-4 w-40 rounded bg-gray-200 dark:bg-slate-700" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-slate-700" />
        <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

function SiteBuilder() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [autosave, setAutosave] = useState(true);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [builderDoc, setBuilderDoc] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await API.get("/api/admin/site/builder");
        if (res.error || res.data?.success === false) {
          throw new Error(res.error || res.data?.error || "Failed to load builder");
        }
        if (!isMountedRef.current) return;
        setBuilderDoc(res.data?.builder || null);
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err?.message || "Failed to load builder");
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    };
    load();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const previewWidthClass = useMemo(() => {
    if (viewport === "mobile") return "w-[375px]";
    if (viewport === "tablet") return "w-[768px]";
    return "w-full";
  }, [viewport]);

  const handleSave = async () => {
    if (!builderDoc) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await API.put("/api/admin/site/builder", builderDoc);
      if (res.error || res.data?.success === false) {
        throw new Error(res.error || res.data?.error || "Failed to save");
      }
      if (!isMountedRef.current) return;
      setNotice("Saved.");
      setBuilderDoc(res.data?.builder || builderDoc);
      setTimeout(() => {
        if (isMountedRef.current) setNotice("");
      }, 1200);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Failed to save");
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <SkeletonCard />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <SkeletonCard />
            <div className="lg:col-span-2">
              <SkeletonCard />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Site Builder
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Build and publish your homepage with live preview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={autosave}
                onChange={(e) => setAutosave(e.target.checked)}
              />
              Autosave
            </label>

            <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
              {[
                { key: "desktop", label: "Desktop" },
                { key: "tablet", label: "Tablet" },
                { key: "mobile", label: "Mobile" }
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setViewport(opt.key)}
                  className={`px-3 py-2 text-xs font-semibold ${
                    viewport === opt.key
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSave}
              disabled={saving || autosave}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm font-semibold"
              title={autosave ? "Disable autosave to use manual Save" : "Save changes"}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: controls */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Sections
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Drag & drop, duplicate, reorder, and edit sections (full editor coming next).
            </p>
            <div className="mt-4 space-y-2">
              {(builderDoc?.sections || []).length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-300 rounded-lg border border-dashed border-gray-300 dark:border-slate-600 p-4">
                  No sections yet.
                </div>
              ) : (
                (builderDoc?.sections || []).map((section) => (
                  <div
                    key={section.id}
                    className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {section.type}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {section.hidden ? "Hidden" : "Visible"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: preview */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Live Preview
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {builderDoc?.updatedAt ? `Updated ${new Date(builderDoc.updatedAt).toLocaleString()}` : ""}
              </span>
            </div>

            <div className="w-full overflow-auto rounded-xl bg-gray-100 dark:bg-slate-900 p-4">
              <div
                className={`mx-auto ${previewWidthClass} min-h-[560px] rounded-xl bg-white dark:bg-slate-800 shadow border border-gray-200 dark:border-slate-700`}
              >
                <div className="p-6">
                  <div className="text-sm text-gray-700 dark:text-gray-200 font-semibold">
                    Preview renderer will appear here once builder integration is enabled.
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    This page is already wired to load/save builder JSON safely.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SiteBuilder;

