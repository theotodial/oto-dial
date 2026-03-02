import { useEffect, useMemo, useRef, useState } from "react";
import API from "../../../api";
import { isSuperAdmin, readStoredAdminProfile } from "../../../utils/adminAccess";

function SiteEnvironment() {
  const adminProfile = readStoredAdminProfile();
  const allowed = isSuperAdmin(adminProfile);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [revealed, setRevealed] = useState({});
  const [draft, setDraft] = useState({});
  const [deleted, setDeleted] = useState({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [restartBackend, setRestartBackend] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isMountedRef = useRef(true);

  const load = async () => {
    if (!allowed) {
      setLoading(false);
      setError("Super-admin access required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await API.get("/api/admin/site/environment");
      if (res.error || res.data?.success === false) {
        throw new Error(res.error || res.data?.error || "Failed to load environment");
      }
      if (!isMountedRef.current) return;
      setRows(res.data?.variables || []);
      setRevealed({});
      setDraft({});
      setDeleted({});
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Failed to load environment");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    load();
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const filtered = useMemo(() => {
    const q = String(filter || "").toLowerCase().trim();
    const base = Array.isArray(rows) ? rows : [];
    const notDeleted = base.filter((r) => !deleted[r.key]);
    if (!q) return notDeleted;
    return notDeleted.filter((r) => String(r.key || "").toLowerCase().includes(q));
  }, [rows, filter, deleted]);

  const pendingChanges = useMemo(() => {
    const ops = [];
    Object.keys(deleted).forEach((key) => {
      if (deleted[key]) ops.push({ action: "delete", key });
    });
    Object.keys(draft).forEach((key) => {
      if (draft[key] === undefined) return;
      ops.push({ action: "update", key, value: draft[key] });
    });
    return ops;
  }, [deleted, draft]);

  const revealValue = async (key) => {
    setError("");
    try {
      const res = await API.post("/api/admin/site/environment/reveal", { key });
      if (res.error || res.data?.success === false) {
        throw new Error(res.error || res.data?.error || "Failed to reveal value");
      }
      if (!isMountedRef.current) return;
      setRevealed((prev) => ({ ...prev, [key]: res.data?.value ?? "" }));
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Failed to reveal value");
    }
  };

  const applyNewVariable = () => {
    const k = String(newKey || "").trim();
    if (!k) return;
    setDraft((prev) => ({ ...prev, [k]: String(newValue ?? "") }));
    setNewKey("");
    setNewValue("");
  };

  const handleSave = async () => {
    if (!allowed) return;
    if (pendingChanges.length === 0) {
      setNotice("No changes to save.");
      setTimeout(() => setNotice(""), 900);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await API.put("/api/admin/site/environment", {
        confirm: true,
        restartBackend,
        changes: pendingChanges
      });
      if (res.error || res.data?.success === false) {
        throw new Error(res.error || res.data?.error || "Failed to save environment changes");
      }
      if (!isMountedRef.current) return;
      setConfirmOpen(false);
      setNotice(res.data?.restarted ? "Saved. Backend restarting..." : "Saved.");
      setTimeout(() => {
        if (isMountedRef.current) setNotice("");
      }, 1400);
      await load();
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Failed to save environment changes");
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading environment variables...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Environment
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Super-admin only. Values are masked by default. Saves are atomic with backups and audit logs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={restartBackend}
                onChange={(e) => setRestartBackend(e.target.checked)}
              />
              Restart backend after save
            </label>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={saving || pendingChanges.length === 0}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm font-semibold"
            >
              {saving ? "Saving..." : `Save changes (${pendingChanges.length})`}
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

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              Variables ({filtered.length})
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by key..."
              className="w-full sm:w-72 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
            />
          </div>

          <div className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
              <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                <div className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Add variable
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="KEY_NAME"
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm font-mono"
                  />
                  <input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="value"
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm font-mono"
                  />
                  <button
                    onClick={applyNewVariable}
                    className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-100 text-sm font-semibold"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Tip: secrets are never returned unless you click Reveal per key.
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Pending changes
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  Updates: {Object.keys(draft).length} <br />
                  Deletes: {Object.keys(deleted).filter((k) => deleted[k]).length}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-4">Key</th>
                    <th className="py-2 pr-4">Value</th>
                    <th className="py-2 w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {filtered.map((row) => {
                    const key = row.key;
                    const isDirty = draft[key] !== undefined;
                    const shown = revealed[key] !== undefined ? revealed[key] : "****";
                    return (
                      <tr key={key} className="text-gray-800 dark:text-gray-200">
                        <td className="py-2 pr-4 font-mono text-xs">{key}</td>
                        <td className="py-2 pr-4">
                          <input
                            value={isDirty ? draft[key] : ""}
                            onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                            placeholder={shown}
                            className={`w-full px-3 py-2 rounded-lg border ${
                              isDirty
                                ? "border-indigo-300 dark:border-indigo-700"
                                : "border-gray-300 dark:border-slate-600"
                            } bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white text-sm font-mono`}
                          />
                          {row.isSensitive && (
                            <div className="mt-1 text-[11px] text-orange-600 dark:text-orange-300">
                              Sensitive
                            </div>
                          )}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => revealValue(key)}
                              className="px-3 py-1.5 rounded-md text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700"
                            >
                              Reveal
                            </button>
                            <button
                              onClick={() => setDeleted((prev) => ({ ...prev, [key]: true }))}
                              className="px-3 py-1.5 rounded-md text-xs bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        No variables found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {confirmOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 p-4 overflow-y-auto">
            <div className="max-w-xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 my-10">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Confirm environment update
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                You are about to apply <span className="font-semibold">{pendingChanges.length}</span> change(s).
                A backup will be created automatically.
              </p>
              <div className="mt-4 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 p-3 text-xs font-mono max-h-56 overflow-auto">
                {pendingChanges.map((op, idx) => (
                  <div key={`${op.action}-${op.key}-${idx}`}>
                    {op.action.toUpperCase()} {op.key}
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-col-reverse sm:flex-row gap-3 justify-end">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-100 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-semibold"
                >
                  {saving ? "Saving..." : "Confirm & Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SiteEnvironment;

