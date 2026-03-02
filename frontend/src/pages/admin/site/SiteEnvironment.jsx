import { useEffect, useMemo, useRef, useState } from "react";
import API from "../../../api";
import { isSuperAdmin, readStoredAdminProfile } from "../../../utils/adminAccess";

function SiteEnvironment() {
  const adminProfile = readStoredAdminProfile();
  const allowed = isSuperAdmin(adminProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
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
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err?.message || "Failed to load environment");
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    };
    load();
    return () => {
      isMountedRef.current = false;
    };
  }, [allowed]);

  const filtered = useMemo(() => {
    const q = String(filter || "").toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => String(r.key || "").toLowerCase().includes(q));
  }, [rows, filter]);

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
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Environment
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Secure `.env` manager with masking, backups, audit logs, and optional restart.
          </p>
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
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-600 p-4 text-sm text-gray-600 dark:text-gray-300">
              The secure editor UI + save flow (mask/reveal, validation, atomic rewrite, backups, audit log, rate limiting) is implemented next.
              This page is already super-admin gated.
            </div>

            {filtered.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <th className="py-2 pr-4">Key</th>
                      <th className="py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {filtered.slice(0, 50).map((row) => (
                      <tr key={row.key} className="text-gray-800 dark:text-gray-200">
                        <td className="py-2 pr-4 font-mono text-xs">{row.key}</td>
                        <td className="py-2 font-mono text-xs">{row.maskedValue || "****"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 50 && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Showing first 50 results. Refine the filter to find specific keys.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SiteEnvironment;

