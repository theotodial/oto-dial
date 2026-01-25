import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PhoneInIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const PhoneOutIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3h5m0 0v5m0-5l-6 6M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
);

const PhoneMissedIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const MessageIcon = ({ className = 'w-5 h-5', strokeWidth = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
  </svg>
);

const MoreIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const PhoneIcon = ({ className = 'w-5 h-5', strokeWidth = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

// Call history icon for recents (phone with clock)
const HistoryIcon = ({ className = 'w-6 h-6', strokeWidth = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.69l1.5 4.49a1 1 0 01-.51 1.21L8.96 10.5a11.05 11.05 0 005.54 5.54l1.35-2.26a1 1 0 011.21-.5l4.49 1.49a1 1 0 01.69.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      d="M12 5a5 5 0 015 5m-3-1h2.5a.5.5 0 01.5.5V12"
    />
  </svg>
);

const BackspaceIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
  </svg>
);

const DialpadIcon = ({ className = 'w-6 h-6', strokeWidth = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
  </svg>
);

// Helper function to generate avatar initials
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name[0]?.toUpperCase() || '?';
};

// Helper function to generate avatar color
const getAvatarColor = (name) => {
  if (!name) return 'bg-gray-400';
  const colors = [
    'bg-indigo-500',
    'bg-green-500',
    'bg-blue-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-yellow-500',
    'bg-red-500',
    'bg-orange-500',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};

// Avatar component
const Avatar = ({ name, phoneNumber, size = 'w-10 h-10', className = '' }) => {
  const displayName = name || phoneNumber || 'Unknown';
  const initials = getInitials(displayName);
  const colorClass = getAvatarColor(displayName);
  
  return (
    <div className={`${size} ${colorClass} rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0 ${className}`}>
      {initials}
    </div>
  );
};

function Recents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // WebRTC call context - with safe defaults
  const callContext = useCall();
  const isInCall = callContext?.isInCall || false;
  const webrtcMakeCall = callContext?.makeCall || (async () => false);
  const callError = callContext?.error || null;
  const isMinimized = callContext?.isMinimized || false;
  const initializeClient = callContext?.initializeClient || (async () => false);

  const [activeTab, setActiveTab] = useState('all'); // 'all', 'missed', 'chats'
  const [selectedCall, setSelectedCall] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null); // For inline chat on mobile
  const [calls, setCalls] = useState([]);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const isMountedRef = useRef(true);
  
  // Inline chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [subscriptionData, setSubscriptionData] = useState({ remainingSMS: 0, planName: 'No Plan' });
  const messagesEndRef = useRef(null);
  
  // Dialer state - MUST be declared before any conditional returns
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userNumbers, setUserNumbers] = useState([]);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [calling, setCalling] = useState(false);
  const [dialCountryCode, setDialCountryCode] = useState('+1');
  const [showDialCountryDropdown, setShowDialCountryDropdown] = useState(false);
  
  // Mobile navigation state
  const [mobileTab, setMobileTab] = useState('chats'); // 'chats', 'recents', 'dialer'
  
  // New chat modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatNumber, setNewChatNumber] = useState('');

  // Simple dialer country list (shared for desktop + mobile)
  const dialCountries = [
    { code: '+1', name: 'United States', flag: '🇺🇸' },
    { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
    { code: '+47', name: 'Norway', flag: '🇳🇴' },
    { code: '+46', name: 'Sweden', flag: '🇸🇪' },
    { code: '+45', name: 'Denmark', flag: '🇩🇰' },
    { code: '+49', name: 'Germany', flag: '🇩🇪' },
    { code: '+33', name: 'France', flag: '🇫🇷' },
    { code: '+39', name: 'Italy', flag: '🇮🇹' },
    { code: '+34', name: 'Spain', flag: '🇪🇸' },
    { code: '+61', name: 'Australia', flag: '🇦🇺' }
  ];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Subscription check - redirect if no subscription (only after loading completes)
  useEffect(() => {
    if (!loading) {
      const checkSubscription = async () => {
        try {
          const response = await API.get('/api/subscription').catch(() => ({ error: true }));
          if (!isMountedRef.current) return;
          
          if (response.error || !response.data || response.data.planName === "No Plan") {
            // No active subscription, redirect to dashboard
            navigate('/dashboard', { replace: true });
          }
        } catch (err) {
          console.warn('Subscription check failed:', err);
        }
      };
      checkSubscription();
    }
  }, [loading, navigate]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchRecents();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch user numbers and subscription - MUST be before conditional returns
  useEffect(() => {
    const fetchDialerData = async () => {
      if (!isMountedRef.current) return;
      
      try {
        const [numbersRes, subRes] = await Promise.all([
          API.get('/api/numbers'),
          API.get('/api/subscription').catch(() => ({ error: true }))
        ]);
        
        if (!isMountedRef.current) return;
        
        if (!numbersRes.error) {
          setUserNumbers(numbersRes.data?.numbers || numbersRes.data || []);
        }
        if (!subRes.error && subRes.data?.planName !== "No Plan") {
          setSubscriptionActive(true);
          setSubscriptionData({
            remainingSMS: subRes.data?.remainingSMS || 0,
            planName: subRes.data?.planName || 'No Plan'
          });
          // Initialize WebRTC client when subscription is active
          initializeClient();
        }
      } catch (err) {
        console.warn('Failed to fetch dialer data:', err);
        // Don't set state if unmounted
        if (!isMountedRef.current) return;
      }
    };
    fetchDialerData();
  }, [initializeClient]);

  // Fetch messages when selectedChat changes
  useEffect(() => {
    if (selectedChat) {
      fetchChatMessages(selectedChat);
    } else {
      setChatMessages([]);
    }
  }, [selectedChat]);

  // Hide sidebar button when chat is open or on dialer tab (mobile only)
  useEffect(() => {
    const sidebarButton = document.getElementById('mobile-sidebar-button');
    if (sidebarButton) {
      if (selectedChat || mobileTab === 'dialer') {
        sidebarButton.style.display = 'none';
      } else {
        sidebarButton.style.display = '';
      }
    }
    return () => {
      if (sidebarButton) {
        sidebarButton.style.display = '';
      }
    };
  }, [selectedChat, mobileTab]);

  const fetchRecents = async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    
    // Fetch calls and messages from API
    const [callsResponse, messagesResponse] = await Promise.all([
      API.get('/api/calls'),
      API.get('/api/messages').catch(() => ({ error: true, data: null })) // Gracefully handle missing endpoint
    ]);

    if (callsResponse.error) {
      console.warn('Failed to load calls:', callsResponse.error);
      setCalls([]);
    } else {
      setCalls(callsResponse.data?.calls || callsResponse.data || []);
    }

    // Process messages and calls into chat sessions format (WhatsApp-style)
      const chatMap = new Map();
    
    // First, process messages into chat sessions
    if (!messagesResponse.error && messagesResponse.data) {
      const messages = messagesResponse.data?.messages || messagesResponse.data || [];
      messages.forEach(msg => {
        const phoneNumber = msg.phone_number || msg.to || msg.from || 'Unknown';
        if (!chatMap.has(phoneNumber)) {
          chatMap.set(phoneNumber, {
            id: phoneNumber,
            phoneNumber,
            lastMessage: msg.message || msg.text || '',
            date: msg.created_at || msg.createdAt || msg.timestamp || new Date(),
            message: msg.message || msg.text || '',
            type: 'sms'
          });
        } else {
          const existing = chatMap.get(phoneNumber);
          const msgDate = new Date(msg.created_at || msg.createdAt || msg.timestamp || 0);
          const existingDate = new Date(existing.date || 0);
          if (msgDate > existingDate) {
            existing.lastMessage = msg.message || msg.text || '';
            existing.date = msg.created_at || msg.createdAt || msg.timestamp;
          }
        }
      });
    }
    
    // Then, process calls into chat sessions (create new chats for numbers with only calls)
    const callsList = callsResponse.data?.calls || callsResponse.data || [];
    callsList.forEach(call => {
      const phoneNumber = call.to_number || call.toNumber || call.phoneNumber || 'Unknown';
      const callDate = call.createdAt || call.created_at || call.timestamp || call.date || new Date();
      
      if (!chatMap.has(phoneNumber)) {
        // Create new chat entry from call
        chatMap.set(phoneNumber, {
          id: phoneNumber,
          phoneNumber,
          lastMessage: `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call`,
          date: callDate,
          type: 'call',
          direction: call.direction || 'outbound',
          status: call.status || 'completed'
        });
      } else {
        // Update existing chat if call is more recent
        const existing = chatMap.get(phoneNumber);
        const existingDate = new Date(existing.date || 0);
        const callDateObj = new Date(callDate);
        if (callDateObj > existingDate) {
          // Update with call info, but keep message content if it's a message
          if (existing.type === 'call' || !existing.lastMessage) {
            existing.lastMessage = `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call`;
          }
          existing.date = callDate;
        }
      }
    });
    
    setChats(Array.from(chatMap.values()));

    if (isMountedRef.current) {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    try {
      const now = new Date();
      const callDate = new Date(date);
      
      // Check if date is valid
      if (isNaN(callDate.getTime())) {
        return '';
      }
      
      const diffMs = now - callDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) {
        return 'Just now';
      } else if (diffMins < 60) {
        return `${diffMins} min${diffMins > 1 ? 's' : ''}`;
      } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
      } else if (diffDays < 7) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = callDate.getDay();
        const month = callDate.getMonth();
        const dateNum = callDate.getDate();
        if (day >= 0 && day < 7 && month >= 0 && month < 12) {
          return `${days[day]}, ${months[month]} ${dateNum}`;
        }
        return '';
      } else {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = callDate.getMonth();
        const dateNum = callDate.getDate();
        if (month >= 0 && month < 12) {
          return `${months[month]} ${dateNum}`;
        }
        return '';
      }
    } catch (err) {
      console.warn('Error formatting date:', err);
      return '';
    }
  };

  const filteredCalls = (calls || []).filter(call => {
    if (activeTab === 'missed') {
      return call?.type === 'missed';
    }
    if (searchQuery) {
      return (call?.phoneNumber || call?.to_number || call?.toNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const filteredChats = (chats || []).filter(chat => {
    if (searchQuery) {
      return (chat?.phoneNumber || chat?.phone_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
             (chat?.message || chat?.lastMessage || '').toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  // Combine calls and chats into chronological timeline
  const combinedRecents = [
    ...filteredCalls.map(call => ({
      id: call.id || call._id,
      type: 'call',
      phoneNumber: call.phoneNumber || call.to_number || call.toNumber,
      date: call.date || call.created_at || call.createdAt,
      direction: call.direction,
      callType: call.type,
      data: call
    })),
    ...filteredChats.map(chat => ({
      id: chat.id || chat._id,
      type: 'sms',
      phoneNumber: chat.phoneNumber || chat.phone_number,
      date: chat.date || chat.created_at || chat.createdAt || chat.timestamp,
      lastMessage: chat.lastMessage || chat.message,
      data: chat
    }))
  ].sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB - dateA; // Most recent first
  });

  // Recent contacts from call logs and chats for suggestions
  const recentContacts = [
    ...(calls || []).slice(0, 5).map(call => ({
      name: call?.contactName || call?.name || 'Unknown',
      number: call?.to_number || call?.toNumber || call?.phoneNumber || '',
    })),
    ...(chats || []).slice(0, 5).map(chat => ({
      name: chat?.contactName || chat?.name || 'Unknown',
      number: chat?.phoneNumber || chat?.phone_number || '',
    }))
  ].filter((contact, index, self) => 
    index === self.findIndex(c => c.number === contact.number) && contact.number
  );

  // Refresh recents after call ends - MUST be before conditional returns
  useEffect(() => {
    if (!isInCall && !calling) {
      fetchRecents();
    }
  }, [isInCall]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-300">Loading recents...</p>
        </div>
      </div>
    );
  }

  const dialpadButtons = [
    { digit: '1', letters: '' },
    { digit: '2', letters: 'ABC' },
    { digit: '3', letters: 'DEF' },
    { digit: '4', letters: 'GHI' },
    { digit: '5', letters: 'JKL' },
    { digit: '6', letters: 'MNO' },
    { digit: '7', letters: 'PQRS' },
    { digit: '8', letters: 'TUV' },
    { digit: '9', letters: 'WXYZ' },
    { digit: '*', letters: '' },
    { digit: '0', letters: '+' },
    { digit: '#', letters: '' },
  ];


  const handleDialpadClick = (digit) => {
    setPhoneNumber(prev => prev + digit);
  };

  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  // Handle long press on 0 to add +
  const handleLongPress = (digit) => {
    if (digit === '0') {
      setPhoneNumber(prev => prev + '+');
    }
  };

  // Handle paste event
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    // Clean the pasted text - allow digits, +, *, #
    const cleanedText = pastedText.replace(/[^\d+*#]/g, '');
    setPhoneNumber(prev => prev + cleanedText);
  };

  // Handle keyboard input for + sign
  const handleKeyDown = (e) => {
    if (e.key === '+') {
      e.preventDefault();
      setPhoneNumber(prev => prev + '+');
    }
  };

  // Format call duration from seconds to readable format
  const formatCallDuration = (seconds) => {
    if (!seconds || seconds === 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return secs > 0 ? `${mins} min ${secs} secs` : `${mins} min${mins > 1 ? 's' : ''}`;
    }
    return `${secs} sec${secs !== 1 ? 's' : ''}`;
  };

  const handleCall = async (number = null) => {
    const rawNumber = number || phoneNumber.trim();
    
    console.log('📞 Recents handleCall:', { rawNumber, calling, isInCall, subscriptionActive, userNumbersCount: userNumbers.length });
    
    if (!rawNumber) {
      console.log('📞 Recents: No number provided');
      alert('Please enter a phone number');
      return;
    }
    
    if (calling || isInCall) {
      console.log('📞 Recents: Already in a call');
      return;
    }

    // Automatically prefix selected country code if user didn't type + code
    const targetNumber = rawNumber.startsWith('+')
      ? rawNumber
      : `${dialCountryCode}${rawNumber}`;
      
    if (!subscriptionActive) {
      console.log('📞 Recents: No subscription');
      alert('Active subscription required to make calls');
      return;
    }
    if (userNumbers.length === 0) {
      console.log('📞 Recents: No user numbers');
      alert('You need to purchase a number first');
      return;
    }

    if (!isMountedRef.current) return;
    setCalling(true);
    
    // Get caller ID
    const callerId = userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || userNumbers?.[0];

    console.log('📞 Recents: Making call to', targetNumber, 'from', callerId);

    try {
      // Make WebRTC call
      const success = await webrtcMakeCall(targetNumber, callerId);
      
      console.log('📞 Recents: webrtcMakeCall returned:', success);
      
      if (!isMountedRef.current) return;
      
      // Clear phone number on success
      if (success && !number) {
        setPhoneNumber('');
      }
      
      // Always reset calling state - GlobalCallOverlay handles the call UI now
      setCalling(false);
      
      // Only show error if call truly failed (success is false AND we're not in a call)
      if (!success && !isInCall) {
        // Wait a moment to check if call actually started
        setTimeout(() => {
          if (!callContext?.isInCall) {
            console.log('📞 Recents: Call failed');
            // Don't show alert - error is already in context
          }
        }, 500);
      }
    } catch (err) {
      console.error('📞 Recents: Call error:', err);
      setCalling(false);
      alert(err.message || 'Failed to place call');
    }
  };

  const handleText = (phoneNumber) => {
    if (!phoneNumber) return;
    // On mobile, open inline chat instead of navigating
    setSelectedChat(phoneNumber);
    setMobileTab('chats');
  };

  const handleNewChat = () => {
    setShowNewChatModal(true);
    setNewChatNumber('');
  };

  const handleStartNewChat = () => {
    if (!newChatNumber || !newChatNumber.trim()) {
      return;
    }
    // Normalize phone number
    const normalizedNumber = newChatNumber.trim().replace(/\s+/g, '');
    setSelectedChat(normalizedNumber);
    setMobileTab('chats');
    setShowNewChatModal(false);
    setNewChatNumber('');
  };

  // Normalize phone number for comparison
  const normalizePhone = (num) => {
    if (!num) return '';
    return num.replace(/\D/g, ''); // Remove all non-digits
  };

  // Fetch messages and calls for selected chat (WhatsApp-style combined timeline)
  const fetchChatMessages = async (phoneNumber) => {
    if (!phoneNumber) return;
    try {
      const normalizedSelected = normalizePhone(phoneNumber);
      
      // Fetch both messages and calls
      const [messagesResponse, callsResponse] = await Promise.all([
        API.get('/api/messages').catch(() => ({ error: true, data: null })),
        API.get('/api/calls').catch(() => ({ error: true, data: null }))
      ]);

      const allItems = [];

      // Filter and format messages
      if (messagesResponse.data?.messages) {
        const filteredMessages = messagesResponse.data.messages.filter(msg => {
          const msgPhone = msg.phone_number || msg.to || msg.from;
          return normalizedSelected === normalizePhone(msgPhone);
        }).map(msg => ({
          ...msg,
          type: 'message',
          timestamp: msg.created_at || msg.timestamp || msg.createdAt
        }));
        allItems.push(...filteredMessages);
      }

      // Filter and format calls for this number
      if (callsResponse.data?.calls || callsResponse.data) {
        const callsList = callsResponse.data?.calls || callsResponse.data || [];
        const filteredCalls = callsList.filter(call => {
          // Check both toNumber and fromNumber to match calls
          const callToPhone = call.to_number || call.toNumber || call.phoneNumber;
          const callFromPhone = call.from_number || call.fromNumber;
          return normalizedSelected === normalizePhone(callToPhone) || 
                 (callFromPhone && normalizedSelected === normalizePhone(callFromPhone));
        }).map(call => ({
          ...call,
          type: 'call',
          timestamp: call.createdAt || call.created_at || call.timestamp || call.date,
          duration: call.durationSeconds || call.duration || call.call_duration || null,
          status: call.status || 'completed',
          // Ensure direction is set correctly
          direction: call.direction || (call.from_number || call.fromNumber ? 'outbound' : 'inbound')
        }));
        allItems.push(...filteredCalls);
      }

      // Sort chronologically (oldest first)
      allItems.sort((a, b) => {
        const dateA = new Date(a.timestamp || 0);
        const dateB = new Date(b.timestamp || 0);
        return dateA - dateB;
      });

      setChatMessages(allItems);
    } catch (err) {
      console.error('Failed to fetch chat messages:', err);
    }
  };

  // Send message inline
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || sending || !selectedChat) return;

    // Note: SMS limits are tracked but not enforced
    // Usage is informational only

    if (userNumbers.length === 0) {
      setSendError('You need to purchase a number first.');
      return;
    }

    const messageText = inputMessage.trim();
    setInputMessage('');
    setSending(true);
    setSendError('');

    try {
      const response = await API.post('/api/sms/send', {
        to: selectedChat,
        text: messageText
      });

      if (response.error) {
        setSendError(response.error);
        setInputMessage(messageText);
      } else {
        // Refresh messages
        await fetchChatMessages(selectedChat);
        await fetchRecents();
      }
    } catch (err) {
      setSendError('Failed to send message. Please try again.');
      setInputMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  // Get contact name from phone number
  const getContactName = (phoneNumber) => {
    // Try to find in calls first
    const call = calls.find(c => (c.to_number || c.toNumber || c.phoneNumber) === phoneNumber);
    if (call?.contactName || call?.name) return call.contactName || call.name;
    
    // Try to find in chats
    const chat = chats.find(c => (c.phoneNumber || c.phone_number) === phoneNumber);
    if (chat?.contactName || chat?.name) return chat.contactName || chat.name;
    
    return null;
  };

  // Mobile Bottom Navigation Component
  const MobileBottomNav = () => (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 safe-area-bottom z-40">
      <div className="mx-3 mb-3 rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-gray-200/80 dark:border-slate-700/80 shadow-[0_10px_30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <div className="grid grid-cols-3 h-16 px-4">
          {/* Chats */}
          <button
            onClick={() => setMobileTab('chats')}
            className="relative flex flex-col items-center justify-center gap-1"
          >
            <span
              className={`flex items-center justify-center rounded-2xl transition-all duration-200
                ${mobileTab === 'chats'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 scale-105'
                  : 'text-gray-500 dark:text-gray-400'
                } w-11 h-11`}
            >
              <MessageIcon
                className="w-6 h-6"
                strokeWidth={mobileTab === 'chats' ? 2.4 : 2}
              />
            </span>
            <span
              className={`h-1 w-1.5 rounded-full transition-opacity ${
                mobileTab === 'chats'
                  ? 'bg-indigo-500 opacity-100'
                  : 'opacity-0'
              }`}
            />
          </button>

          {/* Recents / Call History */}
          <button
            onClick={() => setMobileTab('recents')}
            className="relative flex flex-col items-center justify-center gap-1"
          >
            <span
              className={`flex items-center justify-center rounded-2xl transition-all duration-200
                ${mobileTab === 'recents'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-lg shadow-slate-700/40 scale-105'
                  : 'text-gray-500 dark:text-gray-400'
                } w-11 h-11`}
            >
              <HistoryIcon
                className="w-6 h-6"
                strokeWidth={mobileTab === 'recents' ? 2.4 : 2}
              />
            </span>
            <span
              className={`h-1 w-1.5 rounded-full transition-opacity ${
                mobileTab === 'recents'
                  ? 'bg-slate-900 dark:bg-slate-100 opacity-100'
                  : 'opacity-0'
              }`}
            />
          </button>

          {/* Dialer */}
          <button
            onClick={() => setMobileTab('dialer')}
            className="relative flex flex-col items-center justify-center gap-1"
          >
            <span
              className={`flex items-center justify-center rounded-2xl transition-all duration-200
                ${mobileTab === 'dialer'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/40 scale-105'
                  : 'text-gray-500 dark:text-gray-400'
                } w-11 h-11`}
            >
              <DialpadIcon
                className="w-6 h-6"
                strokeWidth={mobileTab === 'dialer' ? 2.4 : 2}
              />
            </span>
            <span
              className={`h-1 w-1.5 rounded-full transition-opacity ${
                mobileTab === 'dialer'
                  ? 'bg-emerald-500 opacity-100'
                  : 'opacity-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white dark:bg-slate-900">
      {/* Desktop View */}
      <div className="hidden lg:flex flex-col h-full">
        {/* Header - Google Voice Style */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Voice</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 transition-colors">
              <SearchIcon />
            </button>
          </div>
        </div>

        {/* Main Content - Google Voice Style Layout */}
        <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Calls/Chats List */}
        <div className="w-full md:w-1/3 lg:w-1/3 border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800">
          {/* Search and Filters */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="relative mb-4">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab('missed')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'missed'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                Missed
              </button>
              <button
                onClick={() => setActiveTab('chats')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'chats'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                Chats
              </button>
            </div>
          </div>

          {/* Calls/Chats List */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'chats' ? (
              // Chat items only
              filteredChats.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-300">
                  <p>No recent chats</p>
                </div>
              ) : (
                filteredChats.map((chat) => {
                  const phoneNumber = chat.phoneNumber || chat.phone_number || '';
                  const contactName = getContactName(phoneNumber) || chat.contactName || chat.name;
                  const displayName = contactName || phoneNumber || 'Unknown';
                  const isSelected = selectedCall?.id === chat.id || selectedCall?.phoneNumber === phoneNumber;
                  
                  return (
                    <div
                      key={chat.id}
                      onClick={() => {
                        if (phoneNumber) {
                            handleText(phoneNumber);
                        }
                      }}
                      className={`p-3 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar name={displayName} phoneNumber={phoneNumber} size="w-12 h-12" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 dark:text-white truncate">{displayName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-300 ml-2 flex-shrink-0">{formatDate(chat.date)}</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{chat.lastMessage || 'No messages'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : activeTab === 'all' ? (
              // Combined chronological timeline
              combinedRecents.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-300">
                  <p>No recent activity</p>
                </div>
              ) : (
                combinedRecents.map((item) => {
                  const phoneNumber = item.phoneNumber || '';
                  const contactName = getContactName(phoneNumber) || item.data?.contactName || item.data?.name;
                  const displayName = contactName || phoneNumber || 'Unknown';
                  const isSelected = selectedCall?.id === item.id || selectedCall?.phoneNumber === phoneNumber;
                  
                  return (
                    <div
                      key={item.id}
                      className={`group p-3 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                      }`}
                      onClick={() => {
                        if (item.type === 'sms') {
                            // Open inline chat if SMS clicked
                          if (phoneNumber) {
                              handleText(phoneNumber);
                          }
                        } else {
                          setSelectedCall(item.data);
                        }
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="relative flex-shrink-0">
                          <Avatar name={displayName} phoneNumber={phoneNumber} size="w-12 h-12" />
                          {item.type === 'sms' ? (
                            <div className="absolute -bottom-1 -right-1 bg-indigo-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <MessageIcon className="w-3 h-3 text-white" />
                            </div>
                          ) : item.callType === 'missed' ? (
                            <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneMissedIcon className="w-3 h-3 text-white" />
                            </div>
                          ) : item.direction === 'inbound' ? (
                            <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneInIcon className="w-3 h-3 text-white" />
                            </div>
                          ) : (
                            <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneOutIcon className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 dark:text-white truncate">{displayName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-300 ml-2 flex-shrink-0">{formatDate(item.date)}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-300">
                            {item.type === 'sms' ? (
                              <span className="truncate">{item.lastMessage || 'SMS'}</span>
                            ) : (
                              <span className="flex items-center gap-1">
                                {item.direction === 'inbound' ? (
                                  <PhoneInIcon className="w-3 h-3" />
                                ) : (
                                  <PhoneOutIcon className="w-3 h-3" />
                                )}
                                {item.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Action Buttons - Visible on Hover for Calls */}
                      {item.type !== 'sms' && (
                        <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCall(phoneNumber);
                            }}
                            disabled={calling || !subscriptionActive || userNumbers.length === 0}
                            className="flex-1 py-1.5 px-3 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            <PhoneIcon className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleText(phoneNumber);
                            }}
                            className="flex-1 py-1.5 px-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-all"
                          >
                            <MessageIcon className="w-3.5 h-3.5" />
                            <span>Text</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )
            ) : (
              // Call items only (missed)
              filteredCalls.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-300">
                  <p>No recent calls</p>
                </div>
              ) : (
                filteredCalls.map((call) => {
                  const phoneNumber = call.to_number || call.toNumber || call.phoneNumber || '';
                  const contactName = getContactName(phoneNumber) || call.contactName || call.name;
                  const displayName = contactName || phoneNumber || 'Unknown';
                  
                  return (
                    <div
                      key={call.id || call._id}
                      className={`group p-3 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${
                        selectedCall?.id === call.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3" onClick={() => setSelectedCall(call)}>
                        <div className="relative flex-shrink-0">
                          <Avatar name={displayName} phoneNumber={phoneNumber} size="w-12 h-12" />
                          {call.type === 'missed' ? (
                            <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneMissedIcon className="w-3 h-3 text-white" />
                            </div>
                          ) : call.direction === 'inbound' ? (
                            <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneInIcon className="w-3 h-3 text-white" />
                            </div>
                          ) : (
                            <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneOutIcon className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 dark:text-white truncate">{displayName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-300 ml-2 flex-shrink-0">{formatDate(call.date)}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-300">
                            <span>
                              {call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call • {call.status || 'Completed'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Action Buttons - Visible on Hover */}
                      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCall(phoneNumber);
                          }}
                          disabled={calling || !subscriptionActive || userNumbers.length === 0}
                          className="flex-1 py-1.5 px-3 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          <PhoneIcon className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleText(phoneNumber);
                          }}
                          className="flex-1 py-1.5 px-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-all"
                        >
                          <MessageIcon className="w-3.5 h-3.5" />
                          <span>Text</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* Center Panel - Call/Chat Details */}
        <div className="hidden lg:flex flex-1 flex-col bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700">
          {selectedCall ? (
            <>
              {/* Call Header */}
              <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 dark:text-indigo-400 text-2xl font-semibold">
                      {selectedCall.phoneNumber?.[1] || 'U'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{selectedCall?.phoneNumber || 'Unknown'}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Call to {selectedCall?.phoneNumber || 'Unknown'} at exp. {selectedCall?.expiry || 0}
                  </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const phoneNumber = selectedCall?.phoneNumber || selectedCall?.to_number || selectedCall?.toNumber || '';
                      if (phoneNumber) handleCall(phoneNumber);
                    }}
                    disabled={calling || !subscriptionActive || userNumbers.length === 0}
                    className="flex-1 py-2.5 px-4 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <PhoneIcon className="w-5 h-5" />
                    <span>Call</span>
                  </button>
                  <button
                    onClick={() => {
                      const phoneNumber = selectedCall?.phoneNumber || selectedCall?.to_number || selectedCall?.toNumber || '';
                      if (phoneNumber) handleText(phoneNumber);
                    }}
                    className="flex-1 py-2.5 px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageIcon className="w-5 h-5" />
                    <span>Text</span>
                  </button>
                </div>
              </div>

              {/* Call History */}
              <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Call History</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {selectedCall?.phoneNumber || 'Unknown'} ----&gt; (308) 555-0121
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                      {selectedCall?.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call - Exp. {selectedCall?.expiry || 0} (Representative) {formatDate(selectedCall?.date)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Client Details */}
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Client details</h3>
                  <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <MoreIcon />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Uploaded Files */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Uploaded Files</h4>
                    <div className="flex space-x-3">
                      <button className="px-4 py-2 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 rounded-lg font-medium">
                        PDF
                      </button>
                      <button className="px-4 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg font-medium">
                        DOC
                      </button>
                    </div>
                  </div>

                  {/* Voicemail */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Voicemail</h4>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">00:36</span>
                        <button className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 6h12v12H6z" />
                          </svg>
                        </button>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 w-1/3"></div>
                      </div>
                    </div>
                  </div>

                  {/* Notes/Message */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Notes</h4>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        Dear John Bravo,
                        <br /><br />
                        I am writing to inform you of the new pricing model that will be effective from the first of February cycle and this will be reflected in your next billing statement.
                        <br /><br />
                        Sincerely,<br />
                        Arlene
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-300">
              <div className="text-center">
                <ClockIcon className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-500" />
                <p className="text-gray-600 dark:text-gray-300">Select a call or chat to view details</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Compact Dialer (Desktop Only) */}
        <div className="hidden xl:flex w-80 flex-col bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700">
          {/* Call as Section */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Call as</h3>
            <button className="w-full flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg p-2 -m-2 transition-colors group">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                  {(userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || '?')[0] || '?'}
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {userNumbers?.[0]?.label || 'Sales East' || 'Main Number'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || 'No number'}
                  </div>
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Phone Number Display */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <div className="relative">
              <div className="flex items-center space-x-2">
                <PhoneIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <div className="flex-1 text-left">
                    <input
                      type="text"
                      placeholder="Enter a name or number"
                      value={phoneNumber}
                    onChange={(e) => {
                      // Allow digits, +, *, #
                      const cleaned = e.target.value.replace(/[^\d+*#]/g, '');
                      setPhoneNumber(cleaned);
                    }}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                      className="w-full text-lg font-semibold text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-transparent border-none outline-none focus:outline-none"
                    disabled={calling || !subscriptionActive || userNumbers.length === 0}
                    />
                </div>
              </div>
            </div>
          </div>

          {/* Suggestions Section */}
          {phoneNumber && phoneNumber.length > 0 && recentContacts.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">SUGGESTION</div>
              <div className="space-y-2">
                {recentContacts.slice(0, 3).map((contact, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPhoneNumber(contact.number)}
                    className="w-full flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors text-left"
                  >
                    <Avatar name={contact.name} phoneNumber={contact.number} size="w-8 h-8" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{contact.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{contact.number}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Compact Dialpad */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-3">
              {dialpadButtons.map((btn) => {
                let pressTimer = null;
                return (
                <button
                  key={btn.digit}
                  onClick={() => handleDialpadClick(btn.digit)}
                    onMouseDown={() => {
                      if (btn.digit === '0') {
                        pressTimer = setTimeout(() => {
                          handleLongPress('0');
                        }, 500);
                      }
                    }}
                    onMouseUp={() => {
                      if (pressTimer) clearTimeout(pressTimer);
                    }}
                    onMouseLeave={() => {
                      if (pressTimer) clearTimeout(pressTimer);
                    }}
                    onTouchStart={() => {
                      if (btn.digit === '0') {
                        pressTimer = setTimeout(() => {
                          handleLongPress('0');
                        }, 500);
                      }
                    }}
                    onTouchEnd={() => {
                      if (pressTimer) clearTimeout(pressTimer);
                    }}
                  disabled={calling || !subscriptionActive || userNumbers.length === 0}
                  className="aspect-square text-xl font-semibold bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 rounded-xl transition-all active:scale-95 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-600 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center relative group"
                >
                  <span className="text-2xl font-medium">{btn.digit}</span>
                  {btn.letters && (
                    <span className="text-[9px] font-normal text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{btn.letters}</span>
                  )}
                  {/* Hover indicator */}
                  <div className="absolute inset-0 rounded-xl border-2 border-indigo-500 opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none"></div>
                </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleBackspace}
                disabled={!phoneNumber || calling}
                className="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-lg flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                </svg>
              </button>
              <button
                onClick={handleCall}
                disabled={!phoneNumber.trim() || calling || userNumbers.length === 0 || !subscriptionActive}
                className="flex-[2] py-2 bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600 text-white rounded-lg flex items-center justify-center gap-2 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all disabled:shadow-none"
              >
                {calling ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Calling...
                  </>
                ) : (
                  <>
                    <PhoneIcon className="w-4 h-4" />
                    Call
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Mobile View */}
      <div className="lg:hidden flex flex-col h-full">
        {/* Mobile Header - Hidden on dialer tab */}
        {mobileTab !== 'dialer' && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between sticky top-0 z-20 h-14">
            {selectedChat ? (
              <>
                <button
                  onClick={() => setSelectedChat(null)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1 text-center">
                  {getContactName(selectedChat) || selectedChat}
                </h1>
                <button
                  onClick={() => handleCall(selectedChat)}
                  disabled={calling || !subscriptionActive || userNumbers.length === 0}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Call"
                >
                  <PhoneIcon className="w-6 h-6" />
                </button>
              </>
            ) : (
              <>
                <div className="w-10"></div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1 text-center">
            {mobileTab === 'chats' ? 'Chats' : mobileTab === 'recents' ? 'Recents' : 'Dialer'}
          </h1>
                {mobileTab === 'chats' ? (
                  <button 
                    onClick={handleNewChat}
                    className="p-2.5 rounded-full bg-indigo-600 text-white shadow-md hover:shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
                    title="Start new chat"
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="w-10"></div>
                )}
              </>
            )}
        </div>
        )}

        {/* Mobile Tab Content */}
        <div className={`flex-1 ${mobileTab === 'dialer' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {mobileTab === 'chats' && selectedChat ? (
            // Inline Chat View - WhatsApp style
            <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-900">
              {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
                      <MessageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p>No messages yet</p>
                      <p className="text-xs mt-2">Start a conversation</p>
                    </div>
                  ) : (
                    chatMessages.map((item, idx) => {
                      // Handle calls
                      if (item.type === 'call') {
                        const isOutbound = item.direction === 'outbound' || item.direction === 'outbound';
                        const callStatus = item.status || 'completed';
                        const isMissed = callStatus === 'missed';
                        const isFailed = callStatus === 'failed';
                        const callDuration = item.duration ? formatCallDuration(item.duration) : null;
                        const durationSeconds = item.duration || item.durationSeconds || 0;
                        
                        // Format duration like WhatsApp: "5:23" for 5 minutes 23 seconds
                        const formatWhatsAppDuration = (seconds) => {
                          if (!seconds || seconds === 0) return null;
                          const mins = Math.floor(seconds / 60);
                          const secs = seconds % 60;
                          return `${mins}:${String(secs).padStart(2, '0')}`;
                        };
                        
                        const durationFormatted = formatWhatsAppDuration(durationSeconds);
                        
                        // Determine call label
                        let callLabel = 'Voice call';
                        if (isMissed) {
                          callLabel = isOutbound ? 'Missed call' : 'Missed call';
                        } else if (isFailed) {
                          callLabel = 'Failed call';
                        } else if (isOutbound) {
                          callLabel = 'Outgoing call';
                        } else {
                          callLabel = 'Incoming call';
                        }
                        
                        return (
                          <div
                            key={`call-${item.id || item._id || idx}`}
                            className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                          >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2.5 flex items-center gap-2.5 ${
                              isMissed || isFailed
                                ? 'bg-red-500 text-white'
                                : isOutbound
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-700 dark:bg-slate-600 text-white'
                            }`}
                          >
                            {isOutbound ? (
                              <PhoneOutIcon className="w-4 h-4 flex-shrink-0" />
                            ) : (
                              <PhoneInIcon className="w-4 h-4 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{callLabel}</p>
                              <p className="text-xs opacity-90">
                                {durationFormatted || (isMissed ? 'Missed' : isFailed ? 'Failed' : callStatus)}
                              </p>
                            </div>
                            <p className="text-xs opacity-90 flex-shrink-0 ml-1">
                              {formatDate(item.timestamp)}
                            </p>
                          </div>
                          </div>
                        );
                      }
                      
                      // Handle messages
                      const isOutbound = item.direction === 'outbound' || item.sender === 'user';
                      return (
                        <div
                          key={`msg-${item.id || item._id || idx}`}
                          className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                              isOutbound
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{item.message || item.body || item.text}</p>
                            <p className={`text-xs mt-1 ${isOutbound ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}>
                              {formatDate(item.timestamp || item.created_at || item.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              
              {/* Input Area */}
              {sendError && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
                  {sendError}
                </div>
              )}
              <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-full text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || sending}
                    className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    {sending ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </form>
              </div>
            </div>
          ) : mobileTab === 'chats' && (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredChats.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-300">
                  <MessageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p>No recent chats</p>
                </div>
              ) : (
                filteredChats.map((chat) => {
                  const phoneNumber = chat.phoneNumber || chat.phone_number || '';
                  const contactName = getContactName(phoneNumber) || chat.contactName || chat.name;
                  const displayName = contactName || phoneNumber || 'Unknown';
                  
                  return (
                    <div
                      key={chat.id}
                      onClick={() => handleText(phoneNumber)}
                      className="p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 active:bg-gray-100 dark:active:bg-slate-700 transition-all duration-150 active:scale-[0.98]"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar name={displayName} phoneNumber={phoneNumber} size="w-12 h-12" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 dark:text-white truncate">{displayName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-300 ml-2 flex-shrink-0">{formatDate(chat.date)}</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{chat.lastMessage || 'No messages'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {mobileTab === 'recents' && (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredCalls.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-300">
                  <PhoneIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p>No recent calls</p>
                </div>
              ) : (
                filteredCalls.map((call) => {
                  const phoneNumber = call.to_number || call.toNumber || call.phoneNumber || '';
                  const contactName = getContactName(phoneNumber) || call.contactName || call.name;
                  const displayName = contactName || phoneNumber || 'Unknown';
                  
                  return (
                    <div
                      key={call.id || call._id}
                      className="p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 active:bg-gray-100 dark:active:bg-slate-700 transition-all duration-150 active:scale-[0.98]"
                    >
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="relative">
                          <Avatar name={displayName} phoneNumber={phoneNumber} size="w-12 h-12" />
                          {call.type === 'missed' ? (
                            <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneMissedIcon className="w-3 h-3 text-white" />
                            </div>
                          ) : call.direction === 'inbound' ? (
                            <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneInIcon className="w-3 h-3 text-white" />
                            </div>
                          ) : (
                            <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1 border-2 border-white dark:border-slate-800">
                              <PhoneOutIcon className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 dark:text-white truncate">{displayName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-300 ml-2 flex-shrink-0">{formatDate(call.date)}</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-300">
                            {call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call • {call.status || 'Completed'}
                          </p>
                        </div>
                      </div>
                      {/* Action Buttons */}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCall(phoneNumber);
                          }}
                          disabled={calling || !subscriptionActive || userNumbers.length === 0}
                          className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                        >
                          <PhoneIcon className="w-4 h-4" />
                          <span>Call</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleText(phoneNumber);
                          }}
                          className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg flex items-center justify-center gap-2 font-medium transition-all active:scale-95"
                        >
                          <MessageIcon className="w-4 h-4" />
                          <span>Text</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {mobileTab === 'dialer' && (
            <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-900">
              {/* Debug Info - Shows why calling might be blocked */}
              {(!subscriptionActive || userNumbers.length === 0) && (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {!subscriptionActive && '⚠️ No active subscription. '}
                    {userNumbers.length === 0 && '⚠️ No phone number purchased.'}
                  </p>
                </div>
              )}
              
              {/* Active Number - Shows the caller ID */}
              <div className="px-4 py-2 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Your Number</div>
                  <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || 'None'}
                  </div>
                </div>
              </div>

              {/* Phone Number Display with Back Button - Compact Professional Header */}
              <div className="px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setMobileTab('recents')}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 flex-shrink-0 transition-all active:scale-90"
                    title="Go back to recents"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dial Number</span>
                  <div className="w-9" />
                </div>
                <div className="flex items-center gap-2">
                  {/* Country code picker */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowDialCountryDropdown(!showDialCountryDropdown)}
                      className="px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 flex items-center gap-1.5 text-xs font-medium text-gray-900 dark:text-white"
                    >
                      <span className="text-sm">{dialCountries.find(c => c.code === dialCountryCode)?.flag || '🇺🇸'}</span>
                      <span>{dialCountryCode}</span>
                    </button>
                    {showDialCountryDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setShowDialCountryDropdown(false)}
                        />
                        <div className="absolute z-40 mt-2 w-40 max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-xl">
                          {dialCountries.map(country => (
                            <button
                              key={country.code + country.name}
                              type="button"
                              onClick={() => {
                                setDialCountryCode(country.code);
                                setShowDialCountryDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700"
                            >
                              <span>{country.flag}</span>
                              <span className="truncate">{country.name}</span>
                              <span className="ml-auto text-gray-400 dark:text-gray-500">{country.code}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Number input */}
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => {
                        // Allow digits, +, *, #
                        const cleaned = e.target.value.replace(/[^\d+*#]/g, '');
                        setPhoneNumber(cleaned);
                      }}
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                        handleKeyDown(e);
                        if (e.key === 'Enter' && phoneNumber.trim() && !calling && subscriptionActive && userNumbers.length > 0) {
                          handleCall();
                        }
                      }}
                      placeholder="Enter phone number"
                      className="w-full text-lg font-semibold text-gray-900 dark:text-white h-12 px-4 text-center bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={calling || !subscriptionActive || userNumbers.length === 0}
                    />
                    {phoneNumber && (
                      <button
                        onClick={() => setPhoneNumber('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-gray-400 transition-all"
                        aria-label="Clear number"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Dialpad - Professional Mobile Design */}
              <div className="flex-1 flex flex-col justify-center px-3 py-3 bg-gray-50 dark:bg-slate-900 overflow-hidden min-h-0">
                <div className="w-full max-w-xs mx-auto">
                  {/* Keypad Grid - Compact buttons with large numbers */}
                  <div className="grid grid-cols-3 gap-2 mb-2.5">
                    {dialpadButtons.map((btn) => {
                      let pressTimer = null;
                      return (
                      <button
                        key={btn.digit}
                        onClick={() => handleDialpadClick(btn.digit)}
                          onMouseDown={() => {
                            if (btn.digit === '0') {
                              pressTimer = setTimeout(() => {
                                handleLongPress('0');
                              }, 500);
                            }
                          }}
                          onMouseUp={() => {
                            if (pressTimer) clearTimeout(pressTimer);
                          }}
                          onMouseLeave={() => {
                            if (pressTimer) clearTimeout(pressTimer);
                          }}
                          onTouchStart={() => {
                            if (btn.digit === '0') {
                              pressTimer = setTimeout(() => {
                                handleLongPress('0');
                              }, 500);
                            }
                          }}
                          onTouchEnd={() => {
                            if (pressTimer) clearTimeout(pressTimer);
                          }}
                        disabled={calling || !subscriptionActive || userNumbers.length === 0}
                          className="aspect-square w-full bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 
                                     active:bg-gray-100 dark:active:bg-slate-600 rounded-full border border-gray-200 dark:border-slate-700 
                                     transition-all duration-150 active:scale-[0.96] 
                                     text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed 
                                     flex flex-col items-center justify-center"
                        >
                          <span className="text-2xl sm:text-3xl font-bold leading-none text-gray-900 dark:text-white">{btn.digit}</span>
                        {btn.letters && (
                            <span className="text-[7px] sm:text-[8px] font-medium text-gray-500 dark:text-gray-400 mt-0.5 leading-tight uppercase tracking-wide">
                            {btn.letters}
                          </span>
                        )}
                      </button>
                      );
                    })}
                  </div>
                  
                  {/* Delete and Call buttons - Small compact round buttons */}
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={handleBackspace}
                      disabled={!phoneNumber || calling}
                      className="w-12 h-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 
                                 hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600 
                                 text-gray-700 dark:text-gray-200 rounded-full flex items-center justify-center 
                                 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.96]"
                    >
                      <BackspaceIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        console.log('📞 Mobile dialer call button clicked, phoneNumber:', phoneNumber);
                        handleCall();
                      }}
                      disabled={!phoneNumber.trim() || calling || userNumbers.length === 0 || !subscriptionActive}
                      className="w-12 h-12 bg-green-500 hover:bg-green-600 active:bg-green-700 
                                 text-white rounded-full flex items-center justify-center 
                                 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.96]
                                 shadow-sm hover:shadow-md"
                    >
                      {calling ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <PhoneIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Navigation - Hidden when chat is open or on dialer tab */}
      {!selectedChat && mobileTab !== 'dialer' && <MobileBottomNav />}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewChatModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Start New Chat</h2>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter a phone number to start a new conversation
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={newChatNumber}
                  onChange={(e) => {
                    // Allow digits, +, *, #
                    const cleaned = e.target.value.replace(/[^\d+*#]/g, '');
                    setNewChatNumber(cleaned);
                  }}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border-2 border-gray-200 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 transition-all"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newChatNumber.trim()) {
                      handleStartNewChat();
                    }
                  }}
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewChatModal(false)}
                  className="flex-1 py-3 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartNewChat}
                  disabled={!newChatNumber.trim()}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors shadow-lg hover:shadow-xl disabled:shadow-none"
                >
                  Start Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Recents;

