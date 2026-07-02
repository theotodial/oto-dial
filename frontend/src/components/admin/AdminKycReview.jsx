import { useEffect, useState } from 'react';
import API from '../../api';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

function DocPreview({ label, src }) {
  if (!src) return null;
  const isPdf = src.startsWith('data:application/pdf');
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
      {isPdf ? (
        <a href={src} target="_blank" rel="noreferrer" className="text-indigo-600 text-sm underline">
          Open PDF document
        </a>
      ) : (
        <img src={src} alt={label} className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-slate-600 bg-slate-950" />
      )}
    </div>
  );
}

function AdminKycReview() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ search: '', status: 'pending' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      const response = await API.get(`/api/admin/support/kyc?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.error) {
        setError(response.error);
      } else {
        setItems(response.data?.verifications || []);
      }
    } catch (err) {
      setError(err?.error || 'Failed to load KYC queue');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (userId) => {
    setSelected(userId);
    setDetailLoading(true);
    setRejectReason('');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.get(`/api/admin/support/kyc/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.verification) {
        setDetail(response.data.verification);
      }
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = async (status) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.patch(
        `/api/admin/support/kyc/users/${selected}`,
        { status, rejectionReason: rejectReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.error) {
        alert(response.error);
        return;
      }
      await fetchList();
      await loadDetail(selected);
    } catch (err) {
      alert(err?.error || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [filters.status]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">KYC & Identity Verification</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Review AI-assisted identity submissions, documents, and liveness results for manual compliance.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Search name or email…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            type="button"
            onClick={fetchList}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
          >
            Search
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 font-medium text-gray-900 dark:text-white">
            Submissions {loading ? '…' : `(${items.length})`}
          </div>
          <ul className="max-h-[32rem] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
            {items.map((item) => (
              <li key={item.userId}>
                <button
                  type="button"
                  onClick={() => loadDetail(item.userId)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 ${
                    selected === item.userId ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {item.legalName || item.name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status] || ''}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-1">{item.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    AI {item.aiOverallScore ?? '—'}% · {item.autoApproved ? 'Auto' : 'Manual'}
                  </p>
                </button>
              </li>
            ))}
            {!loading && items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-gray-500">No verifications found.</li>
            )}
          </ul>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-lg shadow p-6 min-h-[24rem]">
          {!selected ? (
            <p className="text-gray-500 text-sm">Select a submission to review documents and AI scores.</p>
          ) : detailLoading ? (
            <p className="text-gray-500 text-sm">Loading verification details…</p>
          ) : detail ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{detail.legalName}</h3>
                  <p className="text-sm text-gray-500">{detail.email}</p>
                </div>
                <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_STYLES[detail.status] || ''}`}>
                  {detail.status}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ['AI score', `${detail.aiOverallScore ?? '—'}%`],
                  ['Liveness', `${detail.livenessScore ?? '—'}%`],
                  ['Face match', detail.faceMatchScore != null ? `${detail.faceMatchScore}%` : 'N/A'],
                  ['Name match', `${detail.nameMatchScore ?? '—'}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-gray-50 dark:bg-slate-900/50 p-3 border border-gray-100 dark:border-slate-700">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">DOB:</span> {detail.dateOfBirth || '—'}</div>
                <div><span className="text-gray-500">Document:</span> {detail.documentType || '—'}</div>
                <div><span className="text-gray-500">Country:</span> {detail.documentCountry || '—'}</div>
                <div><span className="text-gray-500">Type:</span> {detail.verificationType || '—'}</div>
                <div className="sm:col-span-2">
                  <span className="text-gray-500">Address:</span>{' '}
                  {[detail.addressLine1, detail.city, detail.stateRegion, detail.postalCode].filter(Boolean).join(', ') || '—'}
                </div>
              </div>

              {detail.aiVerification?.reasons?.length > 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">AI review notes</p>
                  <ul className="text-sm text-amber-800 dark:text-amber-200 list-disc pl-5 space-y-1">
                    {detail.aiVerification.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <DocPreview label="Government ID (front)" src={detail.idDocument} />
                <DocPreview label="Government ID (back)" src={detail.idDocumentBack} />
                <DocPreview label="Live selfie" src={detail.selfieDocument} />
                <DocPreview label="Business document" src={detail.businessDocument} />
              </div>

              {detail.status === 'pending' && (
                <div className="border-t border-gray-200 dark:border-slate-700 pt-4 space-y-3">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Rejection reason (required if rejecting)…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-sm text-gray-900 dark:text-white"
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => updateStatus('approved')}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-60"
                    >
                      Approve & email user
                    </button>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => updateStatus('rejected')}
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Could not load verification details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminKycReview;
