import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../api';
import logo from '../assets/otodial-logo.png';

function Contact() {
  const { user, token, isAuthenticated } = useAuth();
  const [formData, setFormData] = useState({
    businessCategory: '',
    name: user?.name || user?.email || '',
    email: user?.email || '',
    phone: '',
    businessDescription: '',
    serviceRequest: '',
    isUrgent: false
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [userTickets, setUserTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const isMountedRef = useRef(true);

  // Load user tickets if authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchUserTickets();
    }
  }, [isAuthenticated, token]);

  const fetchUserTickets = async () => {
    setLoadingTickets(true);
    try {
      const response = await API.get('/api/support/tickets');
      if (response.data?.success) {
        setUserTickets(response.data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const businessCategories = [
    'E-commerce',
    'Healthcare',
    'Finance',
    'Education',
    'Technology',
    'Real Estate',
    'Retail',
    'Manufacturing',
    'Consulting',
    'Other'
  ];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || !isMountedRef.current) return; // Prevent duplicate submits
    
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await API.post('/api/contact', formData);

      if (!isMountedRef.current) return;

      if (response.error) {
        throw new Error(response.error);
      }

      setSuccess(true);
      
      // Reset form
      setFormData({
        businessCategory: '',
        name: user?.name || user?.email || '',
        email: user?.email || '',
        phone: '',
        businessDescription: '',
        serviceRequest: '',
        isUrgent: false
      });

      // Refresh tickets if user is logged in
      if (isAuthenticated) {
        fetchUserTickets();
      }

      setTimeout(() => {
        if (isMountedRef.current) {
          setSuccess(false);
        }
      }, 5000);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Failed to submit form. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleReply = async (ticketId) => {
    if (!replyMessage.trim() || sendingReply) return;
    
    setSendingReply(true);
    try {
      const response = await API.post(`/api/support/tickets/${ticketId}/reply`, {
        message: replyMessage
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setReplyMessage('');
      await fetchUserTickets();
      // Update selected ticket
      if (selectedTicket?.id === ticketId) {
        const updated = userTickets.find(t => t.id === ticketId);
        if (updated) setSelectedTicket(updated);
      }
    } catch (err) {
      alert(err.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'resolved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <img 
              src={logo} 
              alt="OTO DIAL Logo" 
              className="h-10 md:h-12 w-auto object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.nextElementSibling;
                if (fallback) fallback.classList.remove('hidden');
              }}
            />
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center hidden">
              <span className="text-white font-bold text-xl">OD</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Contact Sales
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Our sales team will reach out to you shortly to discuss your needs
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-500/50 rounded-xl">
            <div className="flex items-center text-green-700 dark:text-green-400">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Thank you! Our team will contact you shortly.</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-500/50 rounded-xl">
            <div className="flex items-center text-red-700 dark:text-red-400">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Contact Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-slate-700">
          <div className="space-y-6">
            {/* Business Category */}
            <div>
              <label htmlFor="businessCategory" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Business Category *
              </label>
              <select
                id="businessCategory"
                name="businessCategory"
                value={formData.businessCategory}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="">Select your business category</option>
                {(businessCategories || []).map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="John Doe"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="john@company.com"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                placeholder="+1 (555) 123-4567"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Business Description */}
            <div>
              <label htmlFor="businessDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Describe Your Business *
              </label>
              <textarea
                id="businessDescription"
                name="businessDescription"
                value={formData.businessDescription}
                onChange={handleChange}
                required
                rows="4"
                placeholder="Tell us about your business and what you do..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
            </div>

            {/* Service Request */}
            <div>
              <label htmlFor="serviceRequest" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What service are you interested in? *
              </label>
              <textarea
                id="serviceRequest"
                name="serviceRequest"
                value={formData.serviceRequest}
                onChange={handleChange}
                required
                rows="4"
                placeholder="Please describe the services you're looking for and any specific requirements..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
            </div>

            {/* Urgency Checkbox */}
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="isUrgent"
                name="isUrgent"
                checked={formData.isUrgent}
                onChange={handleChange}
                className="w-5 h-5 rounded border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer mt-0.5"
              />
              <label htmlFor="isUrgent" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <span className="font-medium">This is urgent</span>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  Check this if you need immediate assistance and our team will prioritize your request
                </p>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                loading
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Submitting...
                </span>
              ) : (
                'Submit Request'
              )}
            </button>
          </div>
        </form>

        {/* Contact Info */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Need more information? Reach out to us directly:
          </p>
          <a 
            href="mailto:info@otodial.com" 
            className="inline-flex items-center justify-center text-lg font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            info@otodial.com
          </a>
        </div>

        {/* User Tickets Section (if logged in) */}
        {isAuthenticated && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Your Support Tickets
            </h2>
            
            {loadingTickets ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading tickets...</p>
              </div>
            ) : userTickets.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-slate-700 text-center">
                <p className="text-gray-600 dark:text-gray-400">You don't have any support tickets yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {userTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-slate-700"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {ticket.subject || 'Support Request'}
                          </h3>
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(ticket.status)}`}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                          {ticket.isUrgent && (
                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                              Urgent
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                          Created: {new Date(ticket.createdAt).toLocaleString()}
                        </p>
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {ticket.message}
                        </p>
                      </div>
                    </div>

                    {/* Replies */}
                    {ticket.replies && ticket.replies.length > 0 && (
                      <div className="mt-4 space-y-3 border-t border-gray-200 dark:border-slate-700 pt-4">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Conversation:</h4>
                        {ticket.replies.map((reply, idx) => (
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
                                {reply.from === 'admin' ? 'Support Team' : 'You'}
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
                    )}

                    {/* Reply Form */}
                    {ticket.status !== 'closed' && (
                      <div className="mt-4 border-t border-gray-200 dark:border-slate-700 pt-4">
                        <textarea
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Type your reply here..."
                          rows={3}
                          className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none mb-3"
                        />
                        <button
                          onClick={() => handleReply(ticket.id)}
                          disabled={!replyMessage.trim() || sendingReply}
                          className={`px-6 py-2 rounded-xl font-medium transition-all ${
                            !replyMessage.trim() || sendingReply
                              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          {sendingReply ? 'Sending...' : 'Send Reply'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Contact;

