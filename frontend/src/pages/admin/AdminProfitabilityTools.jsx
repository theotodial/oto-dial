import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import API from '../../api';

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AdminProfitabilityTools() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [cacheMeta, setCacheMeta] = useState(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheError, setCacheError] = useState('');

  const [warmOnRefresh, setWarmOnRefresh] = useState(false);
  const [warmStart, setWarmStart] = useState('');
  const [warmEnd, setWarmEnd] = useState('');

  const [userId, setUserId] = useState('');
  const [snapStart, setSnapStart] = useState('');
  const [snapEnd, setSnapEnd] = useState('');
  const [snapForce, setSnapForce] = useState(false);
  const [snapEmit, setSnapEmit] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState('');

  const [ovRes, setOvRes] = useState('');
  const [ovResNull, setOvResNull] = useState(false);
  const [ovThrottle, setOvThrottle] = useState('');
  const [ovThrottleNull, setOvThrottleNull] = useState(false);
  const [ovMax, setOvMax] = useState('');
  const [ovMaxNull, setOvMaxNull] = useState(false);
  const [ovExpires, setOvExpires] = useState('');
  const [ovExpiresClear, setOvExpiresClear] = useState(false);
  const [ovNote, setOvNote] = useState('');
  const [ovLoading, setOvLoading] = useState(false);
  const [ovError, setOvError] = useState('');
  const [ovMessage, setOvMessage] = useState('');

  useEffect(() => {
    const id = searchParams.get('userId');
    if (id) setUserId((prev) => prev || id);
  }, [searchParams]);

  const authHeaders = () => {
    const token = localStorage.getItem('adminToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadCacheMeta = useCallback(async () => {
    setCacheLoading(true);
    setCacheError('');
    try {
      const res = await API.get('/api/admin/analytics/profitability/cache', {
        headers: authHeaders(),
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
        return;
      }
      if (res.error || !res.data?.success) {
        setCacheError(res.error || 'Failed to load cache meta');
        setCacheMeta(null);
        return;
      }
      setCacheMeta(res.data.cache ?? res.data);
    } catch (e) {
      setCacheError(e?.message || 'Failed to load cache meta');
    } finally {
      setCacheLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadCacheMeta();
  }, [loadCacheMeta]);

  const refreshCache = async () => {
    setCacheLoading(true);
    setCacheError('');
    try {
      const params = new URLSearchParams();
      if (warmOnRefresh) {
        params.set('warm', '1');
        if (warmStart) params.set('startDate', new Date(warmStart).toISOString());
        if (warmEnd) params.set('endDate', new Date(warmEnd).toISOString());
      }
      const qs = params.toString();
      const url = `/api/admin/analytics/profitability/cache/refresh${qs ? `?${qs}` : ''}`;
      const body =
        warmOnRefresh && (warmStart || warmEnd)
          ? {
              warm: true,
              ...(warmStart ? { startDate: new Date(warmStart).toISOString() } : {}),
              ...(warmEnd ? { endDate: new Date(warmEnd).toISOString() } : {}),
            }
          : warmOnRefresh
            ? { warm: true }
            : {};
      const res = await API.post(url, body, { headers: authHeaders() });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
        return;
      }
      if (res.error || !res.data?.success) {
        setCacheError(res.error || 'Refresh failed');
        return;
      }
      setCacheMeta(res.data.cache ?? res.data);
      if (res.data.warmed && res.data.snapshotMeta) {
        setOvMessage(
          `Warm refresh finished (${res.data.snapshotMeta.userCount ?? 0} users in snapshot).`
        );
      } else {
        setOvMessage('Cache cleared.');
      }
    } catch (e) {
      setCacheError(e?.message || 'Refresh failed');
    } finally {
      setCacheLoading(false);
    }
  };

  const syncOverrideFormFromUser = (ro) => {
    if (!ro) {
      setOvRes('');
      setOvResNull(false);
      setOvThrottle('');
      setOvThrottleNull(false);
      setOvMax('');
      setOvMaxNull(false);
      setOvExpires('');
      setOvExpiresClear(false);
      setOvNote('');
      return;
    }
    setOvRes(ro.reservationMultiplier != null ? String(ro.reservationMultiplier) : '');
    setOvResNull(false);
    setOvThrottle(ro.throttleDelayMs != null ? String(ro.throttleDelayMs) : '');
    setOvThrottleNull(false);
    setOvMax(ro.maxConcurrentCalls != null ? String(ro.maxConcurrentCalls) : '');
    setOvMaxNull(false);
    setOvExpires(toDatetimeLocalValue(ro.expiresAt));
    setOvExpiresClear(false);
    setOvNote(ro.note != null ? String(ro.note) : '');
  };

  const loadSnapshot = async () => {
    const uid = userId.trim();
    if (!uid) {
      setSnapError('Enter a user id.');
      return;
    }
    setSnapLoading(true);
    setSnapError('');
    setOvMessage('');
    try {
      const params = new URLSearchParams();
      if (snapStart) params.set('startDate', new Date(snapStart).toISOString());
      if (snapEnd) params.set('endDate', new Date(snapEnd).toISOString());
      if (snapForce) params.set('force', '1');
      if (snapEmit) params.set('emitEvent', '1');
      const qs = params.toString();
      const res = await API.get(
        `/api/admin/analytics/profitability/users/${encodeURIComponent(uid)}${qs ? `?${qs}` : ''}`,
        { headers: authHeaders() }
      );
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
        return;
      }
      if (res.error || !res.data?.success) {
        setSnapError(res.error || res.data?.error || 'Snapshot failed');
        setSnapshot(null);
        return;
      }
      setSnapshot(res.data);
      syncOverrideFormFromUser(res.data.riskOverrides);
    } catch (e) {
      setSnapError(e?.message || 'Snapshot failed');
      setSnapshot(null);
    } finally {
      setSnapLoading(false);
    }
  };

  const buildOverrideBody = () => {
    const body = {};
    if (ovResNull) body.reservationMultiplier = null;
    else if (ovRes.trim() !== '') {
      const m = Number(ovRes);
      if (!Number.isFinite(m) || m < 1 || m > 2) {
        throw new Error('Reservation multiplier must be between 1 and 2 (or use “agent default”).');
      }
      body.reservationMultiplier = m;
    }
    if (ovThrottleNull) body.throttleDelayMs = null;
    else if (ovThrottle.trim() !== '') {
      const t = Number(ovThrottle);
      if (!Number.isFinite(t) || t < 0 || t > 3000) {
        throw new Error('Throttle delay must be 0–3000 ms (or agent default).');
      }
      body.throttleDelayMs = Math.floor(t);
    }
    if (ovMaxNull) body.maxConcurrentCalls = null;
    else if (ovMax.trim() !== '') {
      const c = Number(ovMax);
      if (!Number.isFinite(c) || c < 1 || c > 10) {
        throw new Error('Max concurrent calls must be 1–10 (or agent default).');
      }
      body.maxConcurrentCalls = Math.floor(c);
    }
    if (ovExpiresClear) body.expiresAt = null;
    else if (ovExpires.trim() !== '') {
      const iso = new Date(ovExpires).toISOString();
      body.expiresAt = iso;
    }
    if (ovNote !== (snapshot?.riskOverrides?.note != null ? String(snapshot.riskOverrides.note) : '')) {
      body.note = ovNote;
    }
    return body;
  };

  const saveOverrides = async () => {
    const uid = userId.trim();
    if (!uid) {
      setOvError('Enter a user id.');
      return;
    }
    setOvLoading(true);
    setOvError('');
    setOvMessage('');
    let body;
    try {
      body = buildOverrideBody();
    } catch (err) {
      setOvError(err.message);
      setOvLoading(false);
      return;
    }
    if (Object.keys(body).length === 0) {
      setOvError('Nothing to save — adjust a field or tick “agent default”.');
      setOvLoading(false);
      return;
    }
    try {
      const res = await API.patch(
        `/api/admin/analytics/profitability/users/${encodeURIComponent(uid)}/risk-overrides`,
        body,
        { headers: authHeaders() }
      );
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
        return;
      }
      if (res.error || !res.data?.success) {
        setOvError(res.error || res.data?.error || 'Save failed');
        return;
      }
      setOvMessage('Risk overrides saved.');
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              riskOverrides: res.data.riskOverrides,
              riskFlags: res.data.riskFlags ?? prev.riskFlags,
            }
          : prev
      );
      syncOverrideFormFromUser(res.data.riskOverrides);
    } catch (e) {
      setOvError(e?.message || 'Save failed');
    } finally {
      setOvLoading(false);
    }
  };

  const clearAllOverrides = async () => {
    const uid = userId.trim();
    if (!uid) {
      setOvError('Enter a user id.');
      return;
    }
    if (!window.confirm('Remove all risk overrides for this user?')) return;
    setOvLoading(true);
    setOvError('');
    setOvMessage('');
    try {
      const res = await API.patch(
        `/api/admin/analytics/profitability/users/${encodeURIComponent(uid)}/risk-overrides`,
        { clear: true },
        { headers: authHeaders() }
      );
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
        return;
      }
      if (res.error || !res.data?.success) {
        setOvError(res.error || 'Clear failed');
        return;
      }
      setOvMessage('All risk overrides cleared.');
      setSnapshot((prev) => (prev ? { ...prev, riskOverrides: null } : prev));
      syncOverrideFormFromUser(null);
    } catch (e) {
      setOvError(e?.message || 'Clear failed');
    } finally {
      setOvLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 min-h-full text-gray-900 dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to="/adminbobby/analytics"
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            ← Analytics
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
            Profitability cache & guardrails
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Requires the <span className="font-medium">analytics</span> admin role. Uses{' '}
            <code className="text-xs bg-gray-100 dark:bg-slate-800 px-1 rounded">/api/admin/analytics/profitability/…</code>
          </p>
        </div>
      </div>

      {(cacheError || snapError || ovError) && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {[cacheError, snapError, ovError].filter(Boolean).join(' ')}
        </div>
      )}
      {ovMessage && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
          {ovMessage}
        </div>
      )}

      <section className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">In-memory profitability cache</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <button
            type="button"
            onClick={loadCacheMeta}
            disabled={cacheLoading}
            className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            Reload meta
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={warmOnRefresh}
              onChange={(e) => setWarmOnRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            Warm (recompute all users — slow)
          </label>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Warm start (optional)</label>
            <input
              type="datetime-local"
              value={warmStart}
              onChange={(e) => setWarmStart(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Warm end (optional)</label>
            <input
              type="datetime-local"
              value={warmEnd}
              onChange={(e) => setWarmEnd(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={refreshCache}
            disabled={cacheLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {cacheLoading ? 'Working…' : 'Clear cache / refresh'}
          </button>
        </div>
        <pre className="text-xs overflow-x-auto rounded-lg bg-gray-50 dark:bg-slate-900 p-4 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-slate-700">
          {cacheLoading && !cacheMeta ? 'Loading…' : JSON.stringify(cacheMeta, null, 2)}
        </pre>
      </section>

      <section className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Per-user snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">User id</label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="MongoDB ObjectId"
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start (optional)</label>
            <input
              type="datetime-local"
              value={snapStart}
              onChange={(e) => setSnapStart(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">End (optional)</label>
            <input
              type="datetime-local"
              value={snapEnd}
              onChange={(e) => setSnapEnd(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={snapForce} onChange={(e) => setSnapForce(e.target.checked)} />
            Force refresh (bypass cache)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={snapEmit} onChange={(e) => setSnapEmit(e.target.checked)} />
            Emit ProfitEvent
          </label>
          <button
            type="button"
            onClick={loadSnapshot}
            disabled={snapLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {snapLoading ? 'Loading…' : 'Load snapshot'}
          </button>
        </div>
        {snapshot && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-white">{snapshot.user?.email || '—'}</span>
              {' · '}
              <span className="font-mono text-xs">{snapshot.user?.id}</span>
            </p>
            <details className="rounded-lg border border-gray-200 dark:border-slate-700">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                Metrics
              </summary>
              <pre className="text-xs overflow-x-auto p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                {JSON.stringify(snapshot.metrics, null, 2)}
              </pre>
            </details>
            <details className="rounded-lg border border-gray-200 dark:border-slate-700">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                riskFlags
              </summary>
              <pre className="text-xs overflow-x-auto p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                {JSON.stringify(snapshot.riskFlags, null, 2)}
              </pre>
            </details>
            <details open className="rounded-lg border border-gray-200 dark:border-slate-700">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                riskOverrides (live)
              </summary>
              <pre className="text-xs overflow-x-auto p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                {JSON.stringify(snapshot.riskOverrides, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manual risk overrides</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Only fields you change are sent. Tick “Agent default” to store <code className="text-xs">null</code> for that
          numeric field (falls back to agent guardrails). Expiry: leave blank to leave unchanged; tick “Clear expiry” to
          remove.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Reservation multiplier (1–2)</label>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input type="checkbox" checked={ovResNull} onChange={(e) => setOvResNull(e.target.checked)} />
                Agent default
              </label>
            </div>
            <input
              type="number"
              step="0.05"
              min="1"
              max="2"
              disabled={ovResNull}
              value={ovRes}
              onChange={(e) => setOvRes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Throttle delay (ms, 0–3000)</label>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input type="checkbox" checked={ovThrottleNull} onChange={(e) => setOvThrottleNull(e.target.checked)} />
                Agent default
              </label>
            </div>
            <input
              type="number"
              min="0"
              max="3000"
              step="50"
              disabled={ovThrottleNull}
              value={ovThrottle}
              onChange={(e) => setOvThrottle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Max concurrent calls (1–10)</label>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input type="checkbox" checked={ovMaxNull} onChange={(e) => setOvMaxNull(e.target.checked)} />
                Agent default
              </label>
            </div>
            <input
              type="number"
              min="1"
              max="10"
              step="1"
              disabled={ovMaxNull}
              value={ovMax}
              onChange={(e) => setOvMax(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Override expires</label>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input type="checkbox" checked={ovExpiresClear} onChange={(e) => setOvExpiresClear(e.target.checked)} />
                Clear expiry
              </label>
            </div>
            <input
              type="datetime-local"
              disabled={ovExpiresClear}
              value={ovExpires}
              onChange={(e) => setOvExpires(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Note (optional)</label>
          <textarea
            value={ovNote}
            onChange={(e) => setOvNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveOverrides}
            disabled={ovLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {ovLoading ? 'Saving…' : 'Save overrides'}
          </button>
          <button
            type="button"
            onClick={clearAllOverrides}
            disabled={ovLoading}
            className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            Clear all overrides
          </button>
        </div>
      </section>
    </div>
  );
}

export default AdminProfitabilityTools;
