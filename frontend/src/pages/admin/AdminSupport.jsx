import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api';

function AdminSupport() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
    startDate: '',
    endDate: ''
  });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [error, setError] = useState('');
  const [adminReply, setAdminReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [page, filters]);

  const fetchTickets = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', '50');
      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await API.get(`/api/admin/support?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setTickets(response.data.tickets || []);
        setTotalPages(response.data.pagination?.pages || 1);
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
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleStatusUpdate = async (ticketId, newStatus) => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.patch(`/api/admin/support/${ticketId}`, {
        status: newStatus
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        await fetchTickets();
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket(null);
        }
      }
    } catch (err) {
      alert(err?.error || 'Failed to update ticket');
    }
  };

  const handleNotesUpdate = async (ticketId, notes) => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.patch(`/api/admin/support/${ticketId}`, {
        adminNotes: notes
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

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
      const token = localStorage.getItem('adminToken');
      const response = await API.patch(`/api/admin/support/${ticketId}`, {
        reply: adminReply
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        alert(response.error);
      } else if (response.data?.success) {
        setAdminReply('');
        await fetchTickets();
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket(response.data.ticket);
        }
      }
    } catch (err) {
      alert(err?.error || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  if (loading && tickets.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading support tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      {/* Header removed - navigation is in sidebar */}
      <header className="hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => navigate('/adminbobby/dashboard')}
                className="text-indigo-600 hover:text-indigo-700 mb-2"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Support Center</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Manage customer support tickets</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <input
              type="text"
              placeholder="Search..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={filters.priority}
              onChange={(e) => handleFilterChange('priority', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            >
              <option value="">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
            <button
              onClick={() => setFilters({ search: '', status: '', priority: '', startDate: '', endDate: '' })}
              className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tickets List */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Ticket ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Priority</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                    {tickets.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                          No tickets found
                        </td>
                      </tr>
                    ) : (
                      tickets.map((ticket) => (
                        <tr
                          key={ticket.id}
                          onClick={() => setSelectedTicket(ticket)}
                          className={`hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer ${
                            selectedTicket?.id === ticket.id ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                          }`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                            {ticket.id.toString().slice(-8)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {ticket.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {ticket.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              ticket.status === 'open' ? 'bg-yellow-100 text-yellow-800' :
                              ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                              ticket.status === 'resolved' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {ticket.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              ticket.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                              ticket.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                              ticket.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {ticket.priority}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {new Date(ticket.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-gray-700 dark:text-gray-300">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Ticket Detail Sidebar */}
          {selectedTicket && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ticket Details</h2>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedTicket.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedTicket.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedTicket.subject || 'No subject'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                  <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{selectedTicket.message}</p>
                </div>

                {/* Replies/Conversation */}
                {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Conversation</label>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedTicket.replies.map((reply, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg ${
                            reply.from === 'admin'
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-500'
                              : 'bg-gray-50 dark:bg-slate-700 border-l-4 border-gray-400'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              {reply.from === 'admin' ? 'Admin' : reply.fromName || 'User'}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(reply.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                            {reply.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin Reply Form */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reply to User</label>
                  <textarea
                    value={adminReply}
                    onChange={(e) => setAdminReply(e.target.value)}
                    placeholder="Type your reply to the user..."
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white mb-2"
                  />
                  <button
                    onClick={() => handleAdminReply(selectedTicket.id)}
                    disabled={!adminReply.trim() || sendingReply}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      !adminReply.trim() || sendingReply
                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {sendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleStatusUpdate(selectedTicket.id, e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Admin Notes</label>
                  <div className="space-y-2 mb-2">
                    {selectedTicket.adminNotes && selectedTicket.adminNotes.length > 0 ? (
                      selectedTicket.adminNotes.map((note, idx) => (
                        <div key={idx} className="p-2 bg-gray-50 dark:bg-slate-700 rounded text-sm">
                          <p className="text-gray-900 dark:text-white">{note.note || note}</p>
                          {note.timestamp && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {new Date(note.timestamp).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No notes yet</p>
                    )}
                  </div>
                  <textarea
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        const newNote = e.target.value.trim();
                        if (newNote) {
                          const updatedNotes = [...(selectedTicket.adminNotes || []), { note: newNote, timestamp: new Date() }];
                          handleNotesUpdate(selectedTicket.id, updatedNotes);
                          e.target.value = '';
                        }
                      }
                    }}
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                    placeholder="Add admin note (Ctrl+Enter to save)..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Created</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(selectedTicket.createdAt).toLocaleString()}
                  </p>
                </div>
                {selectedTicket.resolvedAt && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resolved</label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(selectedTicket.resolvedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminSupport;
