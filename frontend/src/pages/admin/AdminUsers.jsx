import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import API from '../../api';

const PAGE_SIZE_OPTIONS = [20, 50];
const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'email:asc', label: 'Email A–Z' },
  { value: 'email:desc', label: 'Email Z–A' },
  { value: 'credits:desc', label: 'Most credits' },
  { value: 'used:desc', label: 'Most used' },
  { value: 'status:asc', label: 'Status' },
];

const TABS = [
  { id: 'all', label: 'All Users', shortLabel: 'All' },
  { id: 'active', label: 'Active', shortLabel: 'Active' },
  { id: 'paid_stripe', label: 'Paid (Stripe)', shortLabel: 'Paid' },
  { id: 'paid_unactivated', label: 'Paid — not active', shortLabel: 'Paid, inactive' },
  { id: 'no_subscription', label: 'No Subscription', shortLabel: 'No sub' },
  { id: 'blocked', label: 'Blocked', shortLabel: 'Blocked' },
];

const TAB_HELP = {
  paid_unactivated: 'Paid in Stripe (e.g. $70 / 1000 SMS) but no active OtoDial subscription. Resync from the user profile or Stripe → Paid Users.',
  paid_stripe: 'Users with a paid subscription invoice in Mongo. Sync from Stripe → Paid Users if someone is missing.',
};

function formatUsd(value, currency = 'usd') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
  }).format(Number(value));
}

function stripePaidPlanHint(amountPaid) {
  const amount = Number(amountPaid);
  if (amount === 70) return '1000 SMS';
  if (amount === 90) return 'SMS Campaign';
  if (amount === 19.99) return 'Basic';
  if (amount === 29.99) return 'Super';
  if (amount >= 119.99) return 'Unlimited';
  return null;
}

function formatPlanLabel(user) {
  if (user.customPackage?.overridePlan || user.subscription?.status === 'custom_override') {
    return 'Custom Package';
  }
  if (user.subscription?.planName && user.subscription.planName !== 'none') {
    return user.subscription.planName;
  }
  const stripeHint = user.stripePayment ? stripePaidPlanHint(user.stripePayment.amountPaid) : null;
  if (stripeHint) return `${stripeHint} (paid Stripe)`;
  return user.subscriptionPlan || 'No plan';
}

function parseSortValue(value) {
  const [sort, order] = String(value || 'createdAt:desc').split(':');
  return { sort: sort || 'createdAt', order: order || 'desc' };
}

function highlightText(text, query) {
  const source = String(text || '');
  const q = String(query || '').trim();
  if (!q || !source) return source;

  const lowerSource = source.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const idx = lowerSource.indexOf(lowerQuery);
  if (idx === -1) return source;

  return (
    <>
      {source.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-500/30 text-inherit rounded px-0.5">
        {source.slice(idx, idx + q.length)}
      </mark>
      {source.slice(idx + q.length)}
    </>
  );
}

function UsersPagination({ page, totalPages, totalUsers, pageSize, onPageChange, disabled }) {
  const [jumpValue, setJumpValue] = useState(String(page));

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  if (totalPages <= 1) return null;

  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, page + 2);
  const pages = [];
  for (let i = windowStart; i <= windowEnd; i += 1) {
    pages.push(i);
  }

  const commitJump = () => {
    const next = parseInt(jumpValue, 10);
    if (!Number.isFinite(next)) return;
    onPageChange(Math.min(totalPages, Math.max(1, next)));
  };

  return (
    <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Page {page} of {totalPages.toLocaleString()} · {totalUsers.toLocaleString()} total · {pageSize} per page
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || page === 1}
          onClick={() => onPageChange(1)}
          className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
        >
          First
        </button>
        <button
          type="button"
          disabled={disabled || page === 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
        >
          Prev
        </button>

        {windowStart > 1 && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPageChange(1)}
              className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg"
            >
              1
            </button>
            {windowStart > 2 && <span className="px-1 text-gray-400">…</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onPageChange(p)}
            className={`px-3 py-2 text-sm rounded-lg border ${
              p === page
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600'
            }`}
          >
            {p}
          </button>
        ))}

        {windowEnd < totalPages && (
          <>
            {windowEnd < totalPages - 1 && <span className="px-1 text-gray-400">…</span>}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPageChange(totalPages)}
              className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg"
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          type="button"
          disabled={disabled || page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
        >
          Next
        </button>
        <button
          type="button"
          disabled={disabled || page === totalPages}
          onClick={() => onPageChange(totalPages)}
          className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
        >
          Last
        </button>

        <div className="flex items-center gap-2 ml-1">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitJump();
            }}
            className="w-16 px-2 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg"
            aria-label="Jump to page"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={commitJump}
            className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminUsers() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef(null);
  const filterKeyRef = useRef(null);
  const initialLoadRef = useRef(true);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');
  const [page, setPage] = useState(Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1));
  const [pageSize, setPageSize] = useState(
    PAGE_SIZE_OPTIONS.includes(parseInt(searchParams.get('limit') || '20', 10))
      ? parseInt(searchParams.get('limit') || '20', 10)
      : 20
  );
  const [sortValue, setSortValue] = useState(searchParams.get('sort') || 'createdAt:desc');
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('filter') || 'all');

  const { sort, order } = useMemo(() => parseSortValue(sortValue), [sortValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const filterKey = JSON.stringify({ debouncedSearch, activeTab, pageSize, sortValue });
    if (filterKeyRef.current && filterKeyRef.current !== filterKey) {
      setPage(1);
    }
    filterKeyRef.current = filterKey;
  }, [debouncedSearch, activeTab, pageSize, sortValue]);

  const handleTabChange = useCallback((tabId) => {
    setPage(1);
    setActiveTab(tabId);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (page > 1) params.set('page', String(page));
    if (activeTab !== 'all') params.set('filter', activeTab);
    if (pageSize !== 20) params.set('limit', String(pageSize));
    if (sortValue !== 'createdAt:desc') params.set('sort', sortValue);
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, page, activeTab, pageSize, sortValue, setSearchParams]);

  const fetchUsers = useCallback(async (opts = {}) => {
    const isInitial = opts.initial === true;
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      params.append('filter', activeTab);
      params.append('page', String(page));
      params.append('limit', String(pageSize));
      params.append('sort', sort);
      params.append('order', order);

      const response = await API.get(`/api/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setUsers(response.data.users || []);
        setTotalPages(response.data.pages || response.data.pagination?.pages || 1);
        setTotalUsers(response.data.total || response.data.pagination?.total || 0);
      } else {
        setError('Failed to load users');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        setError(err.response?.data?.error || 'Failed to load users');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, debouncedSearch, navigate, order, page, pageSize, sort]);

  useEffect(() => {
    fetchUsers({ initial: initialLoadRef.current });
    initialLoadRef.current = false;
  }, [fetchUsers]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && search) {
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [search]);

  const handleUserClick = (userId) => {
    navigate(`/adminbobby/users/${userId}`);
  };

  const rangeStart = totalUsers === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalUsers);
  const hasActiveFilters = debouncedSearch || activeTab !== 'all' || sortValue !== 'createdAt:desc' || pageSize !== 20;

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setActiveTab('all');
    setSortValue('createdAt:desc');
    setPageSize(20);
    setPage(1);
  };

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Search, filter, and browse {totalUsers.toLocaleString()} users. Press Ctrl+K to focus search.
          </p>
        </div>

        <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-200 dark:border-slate-700 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <input
                ref={searchInputRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email, name, or user ID…"
                className="w-full pl-4 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={sortValue}
                onChange={(e) => setSortValue(e.target.value)}
                className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-white"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <select
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-white"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} / page</option>
                ))}
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-3 py-2.5 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  Reset
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium whitespace-nowrap"
              >
                Create User
              </button>
            </div>
          </div>

          <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
            <div className="flex gap-2 min-w-max">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {TAB_HELP[activeTab] && (
            <p className={`text-xs leading-relaxed ${activeTab === 'paid_unactivated' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`}>
              {TAB_HELP[activeTab]}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400 pt-0.5 border-t border-gray-200/80 dark:border-slate-700/80">
            <span className="truncate">
              {totalUsers === 0
                ? 'No matches'
                : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${totalUsers.toLocaleString()}`}
            </span>
            {refreshing && (
              <span className="inline-flex items-center gap-2 shrink-0">
                <span className="h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                Updating…
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden relative">
          {refreshing && (
            <div className="absolute inset-x-0 top-0 h-0.5 bg-indigo-500/80 animate-pulse z-10" aria-hidden />
          )}
          <div className={`overflow-x-auto transition-opacity duration-150 ${refreshing ? 'opacity-60 pointer-events-none' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plan</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Credits</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden md:table-cell">Used</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden lg:table-cell">Joined</th>
                  <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"> </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/60 group"
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <button
                        type="button"
                        onClick={() => handleUserClick(user.id)}
                        className="text-left w-full"
                      >
                        <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          {highlightText(user.email, debouncedSearch)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {highlightText(user.name || 'Unnamed user', debouncedSearch)}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5" title={user.id}>
                          …{user.id.toString().slice(-8)}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 sm:px-6 py-4 align-top min-w-[140px]">
                      <div className="text-sm text-gray-900 dark:text-white">{formatPlanLabel(user)}</div>
                      {user.stripePayment && (
                        <div className="text-xs text-[#635bff] dark:text-[#a29bfe] mt-0.5">
                          Stripe {formatUsd(user.stripePayment.amountPaid, user.stripePayment.currency)}
                          {user.stripePayment.paidAt && (
                            <span className="text-gray-500 dark:text-gray-400">
                              {' · '}
                              {new Date(user.stripePayment.paidAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {user.customPackage ? 'Custom override' : (user.subscription?.planType || (user.stripePayment ? 'Stripe paid' : 'No subscription'))}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {user.subscription?.isUnlimited
                        ? 'Unlimited'
                        : Math.round(Number(user.credits?.remainingCredits ?? 0)).toLocaleString()}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white hidden md:table-cell">
                      {Math.round(Number(user.credits?.totalCreditsUsed ?? 0)).toLocaleString()}
                    </td>
                    <td className="px-4 sm:px-6 py-4 align-top min-w-[120px]">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                        user.status === 'active' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                        user.status === 'suspended' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                        user.status === 'banned' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                      }`}>
                        {user.status || 'unknown'}
                      </span>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {user.subscription?.status || (user.stripePayment?.needsActivation ? 'paid — not activated' : 'no subscription')}
                      </div>
                      {user.stripePayment?.needsActivation && (
                        <div className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                          Paid in Stripe, no active plan
                        </div>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => handleUserClick(user.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <p className="text-gray-500 dark:text-gray-400">No users match your search or filters.</p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Clear all filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <UsersPagination
          page={page}
          totalPages={totalPages}
          totalUsers={totalUsers}
          pageSize={pageSize}
          onPageChange={setPage}
          disabled={refreshing}
        />
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.post('/api/admin/users', {
        name,
        email,
        password,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        onSuccess();
      } else {
        setError(response.data?.error || 'Failed to create user');
      }
    } catch (err) {
      setError(err?.error || err?.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create New User</h2>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminUsers;
