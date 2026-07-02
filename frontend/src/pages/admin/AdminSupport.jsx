import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import API from '../../api';
import AdminKycReview from '../../components/admin/AdminKycReview';
import AdminSupportUserContext from '../../components/admin/AdminSupportUserContext';
import SupportReplyReadReceipt from '../../components/admin/SupportReplyReadReceipt';

const ISSUE_LABELS = {
  subscription_not_activated: 'Subscription not activated',
  billing_issue: 'Billing issue',
  number_issue: 'Number issue',
  general: 'General support',
};

const STATUS_STYLES = {
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  closed: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
};

const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
};

function StatCard({ label, value, hint, accent = 'indigo' }) {
  const accents = {
    indigo: 'border-indigo-200/70 dark:border-indigo-800/50',
    amber: 'border-amber-200/70 dark:border-amber-800/50',
    emerald: 'border-emerald-200/70 dark:border-emerald-800/50',
  };
  return (
    <div className={`rounded-xl border bg-white dark:bg-slate-800/80 p-4 shadow-sm ${accents[accent] || accents.indigo}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminSupport() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => (searchParams.get('tab') === 'kyc' ? 'kyc' : 'tickets'));
  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTickets, setTotalTickets] = useState(0);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
    startDate: '',
    endDate: '',
  });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [userContext, setUserContext] = useState(null);
  const [userContextLoading, setUserContextLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminReply, setAdminReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [repairingSubscription, setRepairingSubscription] = useState(false);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` } }),
    []
  );

  const fetchStats = useCallback(async () => {
    try {
      const response = await API.get('/api/admin/support/stats', authHeaders);
      if (response.data?.success) {
        setStats(response.data.stats);
      }
    } catch {
      // Non-blocking.
    }
  }, [authHeaders]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', '50');
      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await API.get(`/api/admin/support?${params.toString()}`, authHeaders);

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setTickets(response.data.tickets || []);
        setTotalPages(response.data.pagination?.pages || 1);
        setTotalTickets(response.data.pagination?.total || 0);
      } else {
        setError('Failed to load tickets');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        setError(err.response?.data?.error || 'Failed to load tickets');
      }
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filters, navigate, page]);

  const loadTicketDetails = useCallback(
    async (ticketId) => {
      if (!ticketId) return;
      setUserContextLoading(true);
      try {
        const response = await API.get(`/api/admin/support/${ticketId}`, authHeaders);
        if (response.data?.success) {
          setSelectedTicket(response.data.ticket);
          setUserContext(response.data.userContext || null);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('ticket', String(ticketId));
            next.delete('tab');
            return next;
          }, { replace: true });
        }
      } catch (err) {
        console.error('Failed to load ticket details:', err);
      } finally {
        setUserContextLoading(false);
      }
    },
    [authHeaders, setSearchParams]
  );

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'kyc') setActiveTab('kyc');
  }, [searchParams]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'tickets') fetchTickets();
  }, [activeTab, fetchTickets]);

  useEffect(() => {
    const ticketId = searchParams.get('ticket');
    if (ticketId && activeTab === 'tickets') {
      loadTicketDetails(ticketId);
    }
  }, [searchParams, activeTab, loadTicketDetails]);

  useEffect(() => {
    if (!selectedTicket?.id || activeTab !== 'tickets') return undefined;
    const interval = setInterval(() => {
      loadTicketDetails(selectedTicket.id);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedTicket?.id, activeTab, loadTicketDetails]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const applyQuickFilter = (status) => {
    setFilters((prev) => ({ ...prev, status }));
    setPage(1);
  };

  const handleStatusUpdate = async (ticketId, newStatus) => {
    try {
      const response = await API.patch(`/api/admin/support/${ticketId}`, { status: newStatus }, authHeaders);
      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        await fetchTickets();
        await fetchStats();
        if (selectedTicket?.id === ticketId) await loadTicketDetails(ticketId);
      }
    } catch (err) {
      alert(err?.error || 'Failed to update ticket');
    }
  };

  const handleNotesUpdate = async (ticketId, notes) => {
    try {
      const response = await API.patch(`/api/admin/support/${ticketId}`, { adminNotes: notes }, authHeaders);
      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        await fetchTickets();
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket(response.data.ticket);
        }
      }
    } catch (err) {
      alert(err?.error || 'Failed to update notes');
    }
  };

  const handleAdminReply = async (ticketId) => {
    if (!adminReply.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const response = await API.patch(`/api/admin/support/${ticketId}`, { reply: adminReply }, authHeaders);
      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        setAdminReply('');
        await fetchTickets();
        await fetchStats();
        await loadTicketDetails(ticketId);
      }
    } catch (err) {
      alert(err?.error || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const handleRepairSubscription = async (ticketId) => {
    if (!ticketId || repairingSubscription) return;
    setRepairingSubscription(true);
    try {
      const response = await API.post(`/api/admin/support/${ticketId}/repair-subscription`, {}, authHeaders);
      if (response.error || !response.data) {
        alert(response.error || 'Failed to repair subscription');
      } else {
        await fetchTickets();
        await fetchStats();
        await loadTicketDetails(ticketId);
        alert(response.data.message || 'Repair flow completed');
      }
    } catch (err) {
      alert(err?.error || err?.message || 'Failed to repair subscription');
    } finally {
      setRepairingSubscription(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'kyc') {
        next.set('tab', 'kyc');
        next.delete('ticket');
      } else {
        next.delete('tab');
      }
      return next;
    }, { replace: true });
    if (tab === 'kyc') {
      setSelectedTicket(null);
      setUserContext(null);
    }
  };

  if (loading && tickets.length === 0 && activeTab === 'tickets' && !selectedTicket) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading support center…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Support Center</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Triage tickets, view customer accounts, and resolve billing or number issues.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchTab('tickets')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === 'tickets'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              Support tickets
              {stats?.actionable > 0 && (
                <span className="inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                  {stats.actionable}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => switchTab('kyc')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === 'kyc'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              KYC & identity
              {stats?.pendingKyc > 0 && (
                <span className="inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {stats.pendingKyc}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeTab === 'kyc' ? (
          <AdminKycReview />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Needs attention" value={stats?.actionable ?? '—'} hint="Open + in progress" accent="amber" />
              <StatCard label="Open" value={stats?.open ?? '—'} accent="indigo" />
              <StatCard label="In progress" value={stats?.inProgress ?? '—'} accent="indigo" />
              <StatCard label="All tickets" value={stats?.total ?? totalTickets ?? '—'} hint={`${stats?.resolved ?? 0} resolved/closed`} accent="emerald" />
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-4 shadow-sm space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: '', label: 'All' },
                  { id: 'open', label: 'Open' },
                  { id: 'in_progress', label: 'In progress' },
                  { id: 'resolved', label: 'Resolved' },
                  { id: 'closed', label: 'Closed' },
                ].map((chip) => (
                  <button
                    key={chip.id || 'all'}
                    type="button"
                    onClick={() => applyQuickFilter(chip.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filters.status === chip.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <input
                  type="text"
                  placeholder="Search name, email, subject…"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="xl:col-span-2 px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                />
                <select
                  value={filters.priority}
                  onChange={(e) => handleFilterChange('priority', e.target.value)}
                  className="px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                >
                  <option value="">All priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setFilters({ search: '', status: '', priority: '', startDate: '', endDate: '' });
                    setPage(1);
                  }}
                  className="px-3 py-2 text-sm bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600"
                >
                  Clear filters
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
              <div className="xl:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {totalTickets} ticket{totalTickets === 1 ? '' : 's'}
                  </p>
                  {loading && <span className="text-xs text-gray-400">Refreshing…</span>}
                </div>

                {tickets.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800/50 p-10 text-center">
                    <p className="text-gray-600 dark:text-gray-400">No tickets match your filters.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {tickets.map((ticket) => {
                      const isSelected = selectedTicket?.id === ticket.id;
                      const replyCount = ticket.replies?.length || 0;
                      return (
                        <li key={ticket.id}>
                          <button
                            type="button"
                            onClick={() => loadTicketDetails(ticket.id)}
                            className={`w-full text-left rounded-xl border p-4 transition-all ${
                              isSelected
                                ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/30 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-800'
                                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                  {ticket.subject || ISSUE_LABELS[ticket.issueType] || 'Support request'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                  {ticket.name} · {ticket.email}
                                </p>
                              </div>
                              <span className="text-[10px] font-mono text-gray-400 shrink-0">
                                #{String(ticket.id).slice(-6)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${STATUS_STYLES[ticket.status] || STATUS_STYLES.open}`}>
                                {ticket.status?.replace('_', ' ')}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.medium}`}>
                                {ticket.priority}
                              </span>
                              {replyCount > 0 && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                  {replyCount} repl{replyCount === 1 ? 'y' : 'ies'}
                                </span>
                              )}
                              {ticket.unreadAdminReplies > 0 && (
                                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                  Not seen by customer
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{ticket.message}</p>
                            <p className="text-[10px] text-gray-400 mt-2">{formatWhen(ticket.createdAt)}</p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-600 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-600 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              <div className="xl:col-span-3">
                {!selectedTicket ? (
                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800/40 p-12 text-center min-h-[420px] flex flex-col items-center justify-center">
                    <p className="text-gray-600 dark:text-gray-400">Select a ticket to view details and customer account data.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-gray-400">#{String(selectedTicket.id).slice(-8)}</p>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mt-0.5">
                          {selectedTicket.subject || ISSUE_LABELS[selectedTicket.issueType] || 'Support request'}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {ISSUE_LABELS[selectedTicket.issueType] || selectedTicket.issueType} · {formatWhen(selectedTicket.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTicket(null);
                          setUserContext(null);
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            next.delete('ticket');
                            return next;
                          }, { replace: true });
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                        aria-label="Close ticket"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="p-5 space-y-5 max-h-[calc(100vh-220px)] overflow-y-auto">
                      <AdminSupportUserContext userContext={userContext} loading={userContextLoading} />

                      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                          Customer message
                        </p>
                        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">
                          {selectedTicket.message}
                        </p>
                        {selectedTicket.screenshotUrl && (
                          <a
                            href={selectedTicket.screenshotUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            View screenshot attachment
                          </a>
                        )}
                        {selectedTicket.stripePaymentId && (
                          <p className="mt-2 text-xs font-mono text-gray-500 dark:text-gray-400">
                            Payment ref: {selectedTicket.stripePaymentId}
                          </p>
                        )}
                      </div>

                      {selectedTicket.replies?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                            Conversation
                          </p>
                          <div className="space-y-2">
                            {selectedTicket.replies.map((reply, idx) => (
                              <div
                                key={reply.id || idx}
                                className={`rounded-xl p-3 border ${
                                  reply.from === 'admin'
                                    ? 'bg-indigo-50/80 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                                    : 'bg-gray-50 dark:bg-slate-900/50 border-gray-200 dark:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    {reply.from === 'admin' ? 'Support team' : reply.fromName || 'Customer'}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] text-gray-400">{formatWhen(reply.createdAt)}</span>
                                    {reply.from === 'admin' && (
                                      <SupportReplyReadReceipt readAt={reply.readAt} />
                                    )}
                                  </div>
                                </div>
                                <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{reply.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Reply to customer
                        </p>
                        <textarea
                          value={adminReply}
                          onChange={(e) => setAdminReply(e.target.value)}
                          placeholder="Write a reply — the customer receives an email with a link back to Support."
                          rows={4}
                          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleAdminReply(selectedTicket.id)}
                          disabled={!adminReply.trim() || sendingReply}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sendingReply ? 'Sending…' : 'Send reply & email customer'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                            Ticket status
                          </label>
                          <select
                            value={selectedTicket.status}
                            onChange={(e) => handleStatusUpdate(selectedTicket.id, e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>
                        <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 bg-indigo-50/40 dark:bg-indigo-950/10 p-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Billing context</p>
                          <p className="text-sm text-gray-900 dark:text-white">
                            Subscription: <span className="font-medium">{selectedTicket.subscriptionStatus || 'none'}</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => handleRepairSubscription(selectedTicket.id)}
                            disabled={repairingSubscription}
                            className="mt-2 w-full px-3 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                          >
                            {repairingSubscription ? 'Repairing…' : 'Repair subscription from Stripe'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                          Internal notes (team only)
                        </label>
                        <textarea
                          value={selectedTicket.adminNotes || ''}
                          onChange={(e) =>
                            setSelectedTicket((prev) => ({ ...prev, adminNotes: e.target.value }))
                          }
                          rows={3}
                          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                          placeholder="Notes visible only to admins…"
                        />
                        <button
                          type="button"
                          onClick={() => handleNotesUpdate(selectedTicket.id, selectedTicket.adminNotes || '')}
                          className="mt-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                        >
                          Save internal notes
                        </button>
                      </div>

                      {userContext?.userId && (
                        <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                          <Link
                            to={`/adminbobby/users/${userContext.userId}`}
                            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                          >
                            Manage subscription, numbers, credits & features in Users →
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
