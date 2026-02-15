import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../context/AuthContext';

const SupportIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const getStatusBadge = (status) => {
  const badges = {
    open: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    resolved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    closed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  };
  return badges[status] || badges.open;
};

const getPriorityBadge = (priority) => {
  const badges = {
    low: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    urgent: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  };
  return badges[priority] || badges.medium;
};

const ISSUE_SUBJECT_OPTIONS = [
  { value: 'subscription_not_activated', label: 'Subscription not activated' },
  { value: 'billing_issue', label: 'Billing issue' },
  { value: 'number_issue', label: 'Number issue' },
  { value: 'general', label: 'General support' }
];

const ISSUE_LABEL_BY_TYPE = ISSUE_SUBJECT_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

export default function Support() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [creating, setCreating] = useState(false);
  const [replying, setReplying] = useState(false);
  const [selectedScreenshotFile, setSelectedScreenshotFile] = useState(null);
  
  // Create form state
  const [formData, setFormData] = useState({
    issueType: 'general',
    description: '',
    stripePaymentId: '',
    priority: 'medium',
    category: ''
  });
  
  // Reply form state
  const [replyMessage, setReplyMessage] = useState('');

  useEffect(() => {
    const requestedSubject = (searchParams.get('subject') || '').trim();
    if (requestedSubject && ISSUE_LABEL_BY_TYPE[requestedSubject]) {
      setFormData((prev) => ({ ...prev, issueType: requestedSubject }));
      setShowCreateForm(true);
    }
    fetchTickets();
  }, [searchParams]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await API.get('/api/support/tickets');
      if (response.data?.success) {
        setTickets(response.data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read screenshot file'));
      reader.readAsDataURL(file);
    });

  const handleCreateTicket = async (e) => {
    e.preventDefault();

    if (!formData.issueType) {
      alert('Please select a support subject');
      return;
    }

    if (!formData.description.trim()) {
      alert('Please enter a description of your issue');
      return;
    }

    try {
      setCreating(true);
      let screenshotUrl = null;

      if (selectedScreenshotFile) {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(selectedScreenshotFile.type)) {
          alert('Only PNG, JPG, JPEG, and WEBP screenshots are allowed');
          setCreating(false);
          return;
        }

        const imageData = await fileToDataUrl(selectedScreenshotFile);
        const uploadResponse = await API.post('/api/support/upload-screenshot', { imageData });
        if (uploadResponse.error || !uploadResponse.data?.success) {
          alert(uploadResponse.error || uploadResponse.data?.error || 'Failed to upload screenshot');
          setCreating(false);
          return;
        }
        screenshotUrl = uploadResponse.data.screenshotUrl;
      }

      const payload = {
        issueType: formData.issueType,
        subject: ISSUE_LABEL_BY_TYPE[formData.issueType] || 'General support',
        description: formData.description,
        stripePaymentId: formData.stripePaymentId?.trim() || '',
        priority: formData.priority,
        category: formData.category,
        screenshotUrl
      };

      const response = await API.post('/api/support/tickets', payload);
      
      if (response.error) {
        alert(response.error || 'Failed to create ticket');
        return;
      }
      
      if (response.data?.success) {
        setShowCreateForm(false);
        setFormData({
          issueType: 'general',
          description: '',
          stripePaymentId: '',
          priority: 'medium',
          category: ''
        });
        setSelectedScreenshotFile(null);
        await fetchTickets();
        // Select the newly created ticket
        if (response.data.ticket) {
          const ticketDetail = await API.get(`/api/support/tickets/${response.data.ticket.id}`);
          if (ticketDetail.data?.success) {
            setSelectedTicket(ticketDetail.data.ticket);
          }
        }
      } else {
        alert(response.data?.error || 'Failed to create ticket');
      }
    } catch (err) {
      console.error('Failed to create ticket:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create ticket. Please try again.';
      alert(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) {
      return;
    }

    try {
      setReplying(true);
      const response = await API.post(`/api/support/tickets/${selectedTicket.id}/reply`, {
        message: replyMessage
      });
      if (response.data?.success) {
        setReplyMessage('');
        // Refresh ticket details
        const ticketDetail = await API.get(`/api/support/tickets/${selectedTicket.id}`);
        if (ticketDetail.data?.success) {
          setSelectedTicket(ticketDetail.data.ticket);
          await fetchTickets(); // Refresh list
        }
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
      alert(err.response?.data?.error || 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pt-16 sm:pt-6">
        {/* Header - Mobile Optimized */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">Customer Support</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Get help with your account and services</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all"
          >
            <PlusIcon />
            New Request
          </button>
        </div>

        {/* Create Ticket Form */}
        {showCreateForm && (
          <div className="mb-6 bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Create Support Request</h2>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Subject *
                </label>
                <select
                  value={formData.issueType}
                  onChange={(e) => setFormData({ ...formData, issueType: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                >
                  {ISSUE_SUBJECT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Stripe Payment ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.stripePaymentId}
                    onChange={(e) => setFormData({ ...formData, stripePaymentId: e.target.value })}
                    placeholder="e.g., pi_..., in_..., or checkout session ID"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Category (Optional)
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Billing, Technical, Account"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your issue in detail. Include what you purchased and what is missing."
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload Screenshot (Optional)
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => setSelectedScreenshotFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
                {selectedScreenshotFile && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Selected: {selectedScreenshotFile.name}
                  </p>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormData({
                      issueType: 'general',
                      description: '',
                      stripePaymentId: '',
                      priority: 'medium',
                      category: ''
                    });
                    setSelectedScreenshotFile(null);
                  }}
                  className="px-6 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tickets List and Detail View */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tickets List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700">
              <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Requests</h2>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-center text-gray-500">Loading...</div>
                ) : tickets.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <p>No support requests yet</p>
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="mt-2 text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      Create your first request
                    </button>
                  </div>
                ) : (
                  tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => {
                        API.get(`/api/support/tickets/${ticket.id}`).then(res => {
                          if (res.data?.success) {
                            setSelectedTicket(res.data.ticket);
                          }
                        });
                      }}
                      className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-slate-700 transition-all ${
                        selectedTicket?.id === ticket.id ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate flex-1">
                          {ticket.subject || ISSUE_LABEL_BY_TYPE[ticket.issueType] || 'Support Request'}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ml-2 ${getStatusBadge(ticket.status)}`}>
                          {ticket.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                        {ticket.message}
                      </p>
                      {(ticket.screenshotUrl || ticket.stripePaymentId) && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
                          {ticket.screenshotUrl ? 'Screenshot attached' : ''}
                          {ticket.screenshotUrl && ticket.stripePaymentId ? ' • ' : ''}
                          {ticket.stripePaymentId ? 'Payment reference included' : ''}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className={`px-2 py-0.5 rounded-full ${getPriorityBadge(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                        <span>{formatDate(ticket.createdAt)}</span>
                      </div>
                      {ticket.replies && ticket.replies.length > 0 && (
                        <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                          {ticket.replies.length} {ticket.replies.length === 1 ? 'reply' : 'replies'}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Ticket Detail View */}
          <div className="lg:col-span-2">
            {selectedTicket ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700">
                <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        {selectedTicket.subject || ISSUE_LABEL_BY_TYPE[selectedTicket.issueType] || 'Support Request'}
                      </h2>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(selectedTicket.status)}`}>
                          {selectedTicket.status}
                        </span>
                        <span className={`px-3 py-1 text-sm font-medium rounded-full ${getPriorityBadge(selectedTicket.priority)}`}>
                          {selectedTicket.priority}
                        </span>
                        {selectedTicket.issueType && (
                          <span className="px-3 py-1 text-sm font-medium rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                            {ISSUE_LABEL_BY_TYPE[selectedTicket.issueType] || selectedTicket.issueType}
                          </span>
                        )}
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Created {formatDate(selectedTicket.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Original Message */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium text-sm">
                          {selectedTicket.name?.charAt(0)?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{selectedTicket.name || 'You'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(selectedTicket.createdAt)}</p>
                      </div>
                    </div>
                    <div className="ml-10 p-4 bg-gray-50 dark:bg-slate-700 rounded-xl">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedTicket.message}</p>
                      {selectedTicket.stripePaymentId && (
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                          Stripe Payment ID: <span className="font-mono">{selectedTicket.stripePaymentId}</span>
                        </p>
                      )}
                      {selectedTicket.screenshotUrl && (
                        <div className="mt-3">
                          <a
                            href={selectedTicket.screenshotUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            View uploaded screenshot
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Replies */}
                  {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                    <div className="space-y-4">
                      {selectedTicket.replies.map((reply, index) => (
                        <div key={index}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              reply.from === 'admin' 
                                ? 'bg-blue-100 dark:bg-blue-900' 
                                : 'bg-emerald-100 dark:bg-emerald-900'
                            }`}>
                              <span className={`font-medium text-sm ${
                                reply.from === 'admin' 
                                  ? 'text-blue-600 dark:text-blue-400' 
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}>
                                {reply.from === 'admin' ? 'A' : (reply.fromName?.charAt(0)?.toUpperCase() || 'U')}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {reply.from === 'admin' ? 'Support Team' : (reply.fromName || 'You')}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(reply.createdAt)}</p>
                            </div>
                          </div>
                          <div className={`ml-10 p-4 rounded-xl ${
                            reply.from === 'admin' 
                              ? 'bg-blue-50 dark:bg-blue-900/20' 
                              : 'bg-gray-50 dark:bg-slate-700'
                          }`}>
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{reply.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply Form */}
                  {selectedTicket.status !== 'closed' && (
                    <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
                      <h3 className="font-medium text-gray-900 dark:text-white mb-3">Add a Reply</h3>
                      <form onSubmit={handleReply} className="space-y-3">
                        <textarea
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Type your reply..."
                          rows={4}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                          required
                        />
                        <button
                          type="submit"
                          disabled={replying || !replyMessage.trim()}
                          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {replying ? 'Sending...' : 'Send Reply'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
                <SupportIcon />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-4 mb-2">Select a Request</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Choose a support request from the list to view details and replies
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
