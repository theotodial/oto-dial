import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { useSubscription } from '../context/SubscriptionContext';
import ActiveCallChrome from '../components/ActiveCallChrome';
import { fetchAllContacts } from '../utils/fetchAllContacts';
import { notifySubscriptionChanged } from '../utils/subscriptionSync';
import { threadMatchesPeerPhone } from '../utils/phoneThreadMatch';
import { loadSmsFavorites, addSmsFavorite, removeSmsFavorite } from '../utils/smsFavoritesStorage';
import { loadArchivedPhones, archiveSmsChat, unarchiveSmsChat } from '../utils/smsChatArchiveStorage';

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

/** WhatsApp-style overflow — three horizontal dots */
const HorizontalDotsIcon = ({ className = 'w-6 h-6' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <circle cx="6" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="18" cy="12" r="2" />
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

const TrashIcon = ({ className = 'w-5 h-5', strokeWidth = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const StarIcon = ({ className = 'w-5 h-5', strokeWidth = 2, filled }) => (
  <svg className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
    />
  </svg>
);

/** iMessage-style light; dark matches OTO Dial slate (DashboardLayout / Voice) */
const IOS_CHAT_SURFACE = 'bg-[#F2F2F7] dark:bg-slate-900';
const IOS_NAV_DESKTOP =
  'bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-black/[0.08] dark:border-slate-700';
const IOS_NAV_MOBILE =
  'bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-black/[0.08] dark:border-slate-700';
const IOS_COMPOSER = 'bg-[#F2F2F7] dark:bg-slate-900 border-t border-black/[0.08] dark:border-slate-700';

const IosSendArrowIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 6.5L6 17h12L12 6.5z" />
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

function recentsNormPhone(n) {
  return String(n || '').replace(/\D/g, '');
}

/** Plan + usage strip — hidden everywhere on Voice (use Billing / subscription for details). */
function VoiceSubscriptionStrip() {
  return null;
}

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
  const auth = useAuth();
  const user = auth?.user ?? null;
  const archiveUserKey = user?.id ?? user?._id ?? 'anon';
  const navigate = useNavigate();
  const { subscription, usage, hydrated: subscriptionHydrated, refreshSubscription } = useSubscription();
  
  // WebRTC call context - with safe defaults
  const callContext = useCall();
  const isInCall = callContext?.isInCall || false;
  const webrtcMakeCall = callContext?.makeCall || (async () => false);
  const callError = callContext?.error || null;
  const initializeClient = callContext?.initializeClient || (async () => false);
  const answerCall = callContext?.answerCall || (() => {});
  const rejectCall = callContext?.rejectCall || (() => {});

  const [activeTab, setActiveTab] = useState('all'); // 'all' (recents), 'chats'
  const [selectedChat, setSelectedChat] = useState(null); // For inline chat on mobile
  const [calls, setCalls] = useState([]);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);
  const selectedChatRef = useRef(selectedChat);
  selectedChatRef.current = selectedChat;
  
  // Inline chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef(null);
  const smsSendLockRef = useRef(false);
  const suspiciousActivityText =
    'SUSPICIOUS ACTIVITY DETECTED. You have reached your daily usage threshold. Please contact support.';

  const isSuspiciousActivityError = (message) =>
    String(message || '').toLowerCase().includes('suspicious activity detected');
  
  // Dialer state - MUST be declared before any conditional returns
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userNumbers, setUserNumbers] = useState([]);
  const [dialCountryCode, setDialCountryCode] = useState('+1');
  const subscriptionKnown = subscriptionHydrated;
  const canUseService = Boolean(subscription?.id ?? subscription?._id);
  const billingUiActive = Boolean(subscription?.isActive ?? subscription?.active);
  const isManuallyEnabled = Boolean(
    subscription?.isManuallyEnabled ??
      (Number(subscription?.limits?.smsTotal ?? 0) > 0 ||
        Number(subscription?.limits?.minutesTotal ?? 0) > 0)
  );
  const subscriptionUsable = billingUiActive || isManuallyEnabled;
  const subscriptionData = {
    remainingSMS: usage?.smsRemaining ?? subscription?.smsRemaining ?? 0,
    minutesRemaining: usage?.minutesRemaining ?? subscription?.minutesRemaining ?? 0,
    planName: subscription?.planName || 'No Plan',
  };

  const [showDialCountryDropdown, setShowDialCountryDropdown] = useState(false);
  /** True while outbound makeCall is in flight (before isInCall may update). */
  const [calling, setCalling] = useState(false);
  const isCallBusy = calling || isInCall;

  // Mobile navigation state
  const [mobileTab, setMobileTab] = useState('chats'); // 'chats', 'recents', 'dialer'

  /** Tailwind lg (1024px): 3-column Voice layout + in-column call UI (must match GlobalCallOverlay /recents skip). */
  const [isLgDesktopVoice, setIsLgDesktopVoice] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLgDesktopVoice(mq.matches);
    const fn = () => setIsLgDesktopVoice(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const callIdleRef = useRef(true);
  useEffect(() => {
    const IDLE = callContext?.CALL_STATES?.IDLE ?? 'idle';
    const idle = (callContext?.callState ?? IDLE) === IDLE;
    if (!idle && callIdleRef.current) {
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
        setMobileTab('dialer');
      }
    }
    callIdleRef.current = idle;
  }, [callContext?.callState, callContext?.CALL_STATES?.IDLE]);
  
  // New chat modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatNumber, setNewChatNumber] = useState('');
  // Delete confirm modals
  const [deleteChatTarget, setDeleteChatTarget] = useState(null); // phoneNumber or null
  const [deleteCallHistoryConfirm, setDeleteCallHistoryConfirm] = useState(false);
  const [deleteCallTarget, setDeleteCallTarget] = useState(null); // single call id or null
  const [deleting, setDeleting] = useState(false);
  // Contacts (synced with backend, visible on mobile + desktop)
  const [contacts, setContacts] = useState([]);
  const [showSaveContactModal, setShowSaveContactModal] = useState(false);
  const [saveContactNumber, setSaveContactNumber] = useState('');
  const [saveContactName, setSaveContactName] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [importingContacts, setImportingContacts] = useState(false);
  const [archiveTick, setArchiveTick] = useState(0);
  const [chatListActionMenu, setChatListActionMenu] = useState(null); // { clientX, clientY, phoneNumber }
  const [archivedChatsModalOpen, setArchivedChatsModalOpen] = useState(false);
  const suppressChatRowOpenUntilRef = useRef(0);
  const [messageActionMenu, setMessageActionMenu] = useState(null); // { clientX, clientY, text }
  const [forwardText, setForwardText] = useState(null);
  const [favoritesModalOpen, setFavoritesModalOpen] = useState(false);
  const [favoriteEntries, setFavoriteEntries] = useState([]);
  const [actionToast, setActionToast] = useState('');
  const longPressBubbleTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const messageActionMenuRef = useRef(null);
  const chatListActionMenuRef = useRef(null);
  /** Mobile thread header ⋮ menu: fixed position from viewport (top / right px) */
  const [mobileThreadOverflowMenu, setMobileThreadOverflowMenu] = useState(null);
  const mobileThreadOverflowBtnRef = useRef(null);
  const mobileThreadOverflowMenuRef = useRef(null);
  // Read/unread state and notifications
  const [readState, setReadState] = useState({}); // phoneNumber -> lastReadAt
  const [unreadCounts, setUnreadCounts] = useState({}); // phoneNumber -> count
  const lastUnreadTotalRef = useRef(0);
  const notificationPermissionRef = useRef(null);
  const pushSubscribeAttemptedRef = useRef(false);

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
    { code: '+61', name: 'Australia', flag: '🇦🇺' },
    { code: '+81', name: 'Japan', flag: '🇯🇵' },
    { code: '+82', name: 'South Korea', flag: '🇰🇷' },
    { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
    { code: '+91', name: 'India', flag: '🇮🇳' },
    { code: '+27', name: 'South Africa', flag: '🇿🇦' },
    { code: '+263', name: 'Zimbabwe', flag: '🇿🇼' }
  ];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  useEffect(() => {
    if (!loading && subscriptionKnown && !canUseService) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, navigate, subscriptionKnown, canUseService]);

  // Fetch user numbers - MUST be before conditional returns
  useEffect(() => {
    const fetchDialerData = async () => {
      if (!isMountedRef.current) return;
      
      try {
        const numbersRes = await API.get('/api/numbers');
        
        if (!isMountedRef.current) return;
        
        if (!numbersRes.error) {
          setUserNumbers(numbersRes.data?.numbers || numbersRes.data || []);
        }
      } catch (err) {
        console.warn('Failed to fetch dialer data:', err);
        // Don't set state if unmounted
        if (!isMountedRef.current) return;
      }
    };
    fetchDialerData();
  }, []);

  // Normalize phone number for comparison (used by fetchChatMessages)
  const normalizePhone = (num) => {
    if (!num) return '';
    return num.replace(/\D/g, '');
  };

  // Thread fetch: messages load first, calls merge after (no blocking spinner).
  const THREAD_CHAT_MESSAGES_LIMIT = 150;
  const THREAD_CHAT_CALLS_LIMIT = 40;
  /** Enough rows to rebuild many chat threads for the sidebar (backend caps ~2000). */
  const RECENTS_MESSAGES_AGG_LIMIT = 800;
  const RECENTS_CALLS_AGG_LIMIT = 120;

  const mergeThreadItemsWithPending = useCallback((allItems, prev) => {
    const pending = prev.filter((x) => x._localPending);
    const stillPending = pending.filter((p) => {
      const pText = String(p.message || p.text || '').trim();
      return !allItems.some((s) => {
        if (s.type !== 'message') return false;
        const sText = String(s.message || s.text || s.body || '').trim();
        if (sText !== pText) return false;
        return s.direction === 'outbound' || s.sender === 'user';
      });
    });
    return [...allItems, ...stillPending].sort((a, b) => {
      const dateA = new Date(a.timestamp || 0);
      const dateB = new Date(b.timestamp || 0);
      return dateA - dateB;
    });
  }, []);

  const buildThreadItems = useCallback(
    (phoneNumber, messagesResponse, callsResponse) => {
      const allItems = [];
      if (messagesResponse?.data?.messages) {
        const mapped = messagesResponse.data.messages.map((msg) => ({
          ...msg,
          type: 'message',
          timestamp: msg.created_at || msg.timestamp || msg.createdAt
        }));
        const filtered = mapped.filter((msg) => {
          const peer = msg.phone_number || msg.to || msg.from;
          return threadMatchesPeerPhone(phoneNumber, peer);
        });
        allItems.push(...(filtered.length > 0 ? filtered : mapped));
      }
      if (callsResponse?.data?.calls || callsResponse?.data) {
        const callsList = callsResponse.data?.calls || callsResponse.data || [];
        const filteredCalls = callsList
          .filter((call) => {
            const callToPhone = call.to_number || call.toNumber || call.phoneNumber;
            const callFromPhone = call.from_number || call.fromNumber;
            return (
              threadMatchesPeerPhone(phoneNumber, callToPhone) ||
              (callFromPhone && threadMatchesPeerPhone(phoneNumber, callFromPhone))
            );
          })
          .map((call) => ({
            ...call,
            type: 'call',
            timestamp: call.createdAt || call.created_at || call.timestamp || call.date,
            duration: call.durationSeconds ?? call.duration ?? call.call_duration ?? null,
            durationSeconds: call.durationSeconds ?? call.duration ?? call.call_duration ?? null,
            status: call.status || 'completed',
            direction: call.direction || (call.from_number || call.fromNumber ? 'outbound' : 'inbound')
          }));
        allItems.push(...filteredCalls);
      }
      allItems.sort((a, b) => {
        const dateA = new Date(a.timestamp || 0);
        const dateB = new Date(b.timestamp || 0);
        return dateA - dateB;
      });
      return allItems;
    },
    []
  );

  const fetchChatMessages = useCallback(
    async (phoneNumber) => {
      if (!phoneNumber) return;
      const forPhone = phoneNumber;
      try {
        const messagesResponse = await API.get('/api/messages', {
          params: { thread: forPhone, limit: THREAD_CHAT_MESSAGES_LIMIT }
        }).catch(() => ({ error: true, data: null }));

        if (selectedChatRef.current !== forPhone) return;

        const itemsMessagesOnly = buildThreadItems(forPhone, messagesResponse, null);
        if (isMountedRef.current) {
          setChatMessages((prev) => mergeThreadItemsWithPending(itemsMessagesOnly, prev));
        }
        setChatLoading(false);

        const callsResponse = await API.get('/api/calls', {
          params: { thread: forPhone, limit: THREAD_CHAT_CALLS_LIMIT }
        }).catch(() => ({ error: true, data: null }));

        if (!isMountedRef.current || selectedChatRef.current !== forPhone) return;

        const allItems = buildThreadItems(forPhone, messagesResponse, callsResponse);
        setChatMessages((prev) => mergeThreadItemsWithPending(allItems, prev));
      } catch (err) {
        console.error('Failed to fetch chat messages:', err);
        if (selectedChatRef.current === forPhone) setChatLoading(false);
      }
    },
    [buildThreadItems, mergeThreadItemsWithPending]
  );

  // Fetch messages when selectedChat changes (clear stale thread; ignore out-of-order responses via selectedChatRef)
  useEffect(() => {
    if (selectedChat) {
      setChatMessages([]);
      setChatLoading(true);
      fetchChatMessages(selectedChat);
    } else {
      setChatMessages([]);
      setChatLoading(false);
    }
  }, [selectedChat, fetchChatMessages]);

  // Fetch read state and unread counts (must be defined before use)
  const fetchReadStateAndUnread = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const [readRes, unreadRes] = await Promise.all([
        API.get('/api/messages/read-state').catch(() => ({ data: null })),
        API.get('/api/messages/unread-counts').catch(() => ({ data: null }))
      ]);
      if (isMountedRef.current) {
        if (readRes?.data?.readState) setReadState(readRes.data.readState);
        if (unreadRes?.data?.unreadCounts) setUnreadCounts(unreadRes.data.unreadCounts);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Mark thread as read when user opens a chat
  useEffect(() => {
    if (!selectedChat) return;
    const markRead = async () => {
      try {
        await API.post('/api/messages/read-state', { phoneNumber: selectedChat });
        setUnreadCounts((prev) => {
          const next = { ...(prev || {}) };
          const n = normPhone(selectedChat);
          for (const k of Object.keys(next)) {
            if (normPhone(k) === n) delete next[k];
          }
          return next;
        });
      } catch (e) {
        // ignore
      }
    };
    markRead();
  }, [selectedChat]);

  // Web Push subscribe helper (so we get notifications when app is closed)
  const subscribeToPush = useCallback(async () => {
    if (pushSubscribeAttemptedRef.current) return;
    pushSubscribeAttemptedRef.current = true;
    try {
      const keyRes = await API.get('/api/push/vapid-public');
      const publicKey = keyRes?.data?.publicKey;
      if (!publicKey) return;
      const reg = await navigator.serviceWorker.ready;
      const buf = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: buf });
      const subscription = sub.toJSON ? sub.toJSON() : { endpoint: sub.endpoint, keys: { auth: sub.getKey?.('auth'), p256dh: sub.getKey?.('p256dh') } };
      if (subscription?.keys?.auth && subscription?.keys?.p256dh) {
        const auth = typeof subscription.keys.auth === 'string' ? subscription.keys.auth : btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.keys.auth)));
        const p256dh = typeof subscription.keys.p256dh === 'string' ? subscription.keys.p256dh : btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.keys.p256dh)));
        await API.post('/api/push/subscribe', { endpoint: subscription.endpoint, keys: { auth, p256dh } });
      }
    } catch (_) {
      // Push not configured or already subscribed
    }
  }, []);

  // Notifications: request permission and poll for new messages when tab is in background
  const getContactNameRef = useRef(() => null);
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (notificationPermissionRef.current === null && Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        notificationPermissionRef.current = p;
        if (p === 'granted' && 'serviceWorker' in navigator && 'PushManager' in window) {
          subscribeToPush();
        }
      });
    } else {
      notificationPermissionRef.current = Notification.permission;
    }
    return undefined;
  }, []);

  // Update lastUnreadTotalRef when unreadCounts changes (so we don't re-notify on same count)
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    lastUnreadTotalRef.current = total;
  }, [unreadCounts]);

  // Web Push: subscribe on mount when permission already granted
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;
    subscribeToPush();
  }, [subscribeToPush]);

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

  const fetchRecents = useCallback(async (showLoading = false) => {
    if (!isMountedRef.current) return;
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [callsResponse, messagesResponse] = await Promise.all([
        API.get('/api/calls', { params: { limit: RECENTS_CALLS_AGG_LIMIT } }),
        API.get('/api/messages', { params: { limit: RECENTS_MESSAGES_AGG_LIMIT } }).catch(() => ({
          error: true,
          data: null,
        })),
      ]);

      if (!isMountedRef.current) return;
      if (callsResponse.error) {
        setCalls([]);
      } else {
        setCalls(callsResponse.data?.calls || callsResponse.data || []);
      }

      const chatMap = new Map();
      const threadKey = (raw) => {
        const p = String(raw || '').trim();
        const digits = p.replace(/\D/g, '');
        if (!digits) return p || 'unknown';
        return digits;
      };
      const displayPhone = (raw) => {
        const p = String(raw || '').trim();
        if (!p) return '';
        if (p.startsWith('+')) return p;
        const digits = p.replace(/\D/g, '');
        return digits ? `+${digits}` : p;
      };
      if (!messagesResponse.error && messagesResponse.data) {
        const messages = messagesResponse.data?.messages || messagesResponse.data || [];
        messages.forEach((msg) => {
          const rawPeer = msg.phone_number || msg.to || msg.from || '';
          const key = threadKey(rawPeer);
          if (!key || key === 'unknown') return;
          const phoneNumber = displayPhone(rawPeer);
          if (!chatMap.has(key)) {
            chatMap.set(key, {
              id: key,
              phoneNumber,
              lastMessage: msg.message || msg.text || '',
              date: msg.created_at || msg.createdAt || msg.timestamp || new Date(),
              message: msg.message || msg.text || '',
              type: 'sms',
            });
          } else {
            const existing = chatMap.get(key);
            const msgDate = new Date(msg.created_at || msg.createdAt || msg.timestamp || 0);
            const existingDate = new Date(existing.date || 0);
            if (msgDate > existingDate) {
              existing.lastMessage = msg.message || msg.text || '';
              existing.date = msg.created_at || msg.createdAt || msg.timestamp;
              if (phoneNumber) existing.phoneNumber = phoneNumber;
            }
          }
        });
      }
      setChats(Array.from(chatMap.values()));
      if (isMountedRef.current) fetchReadStateAndUnread();
    } catch (err) {
      if (isMountedRef.current) {
        setCalls([]);
        setChats([]);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [fetchReadStateAndUnread]);

  const fetchContacts = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const list = await fetchAllContacts();
      if (isMountedRef.current) setContacts(list);
    } catch (e) {
      // ignore
    }
  }, []);

  // Only clear on real unmount — never tie this to fetchRecents deps or chat fetches can skip setState and leave chatLoading stuck true.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchRecents(false);
    fetchContacts();
    fetchReadStateAndUnread();
  }, [fetchRecents, fetchContacts, fetchReadStateAndUnread]);

  // Inbound SMS is stored by webhooks; refresh the open thread periodically so replies appear without a tab reload.
  useEffect(() => {
    if (!selectedChat) return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      fetchChatMessages(selectedChat);
    };
    const id = setInterval(tick, 5000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        fetchChatMessages(selectedChat);
        fetchReadStateAndUnread();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [selectedChat, fetchChatMessages, fetchReadStateAndUnread]);

  // Keep chat list / combined recents in sync while this page is open (new threads, previews, unread).
  useEffect(() => {
    const id = setInterval(() => {
      if (!isMountedRef.current || document.visibilityState !== 'visible') return;
      fetchRecents(false);
      fetchReadStateAndUnread();
    }, 10000);
    return () => clearInterval(id);
  }, [fetchRecents, fetchReadStateAndUnread]);

  const formatDate = (date) => {
    if (!date) return '';
    try {
      const now = new Date();
      const callDate = new Date(date);
      if (isNaN(callDate.getTime())) return '';
      const diffMs = now - callDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''}`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (diffDays < 7) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `${days[callDate.getDay()]}, ${months[callDate.getMonth()]} ${callDate.getDate()}`;
      }
      return `${months[callDate.getMonth()]} ${callDate.getDate()}`;
    } catch (err) {
      console.warn('Error formatting date:', err);
      return '';
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const h = d.getHours();
      const m = d.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      const time = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
      return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${time}`;
    } catch (err) {
      return '';
    }
  };

  const formatTime = (date) => {
    if (!date) return '';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      const h = d.getHours();
      const m = d.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    } catch (err) {
      return '';
    }
  };

  const formatDuration = (seconds) => {
    if (seconds == null || seconds === 0) return '—';
    const mins = Math.floor(Number(seconds) / 60);
    const secs = Math.floor(Number(seconds) % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const filteredCalls = calls || [];
  const getLastDialableNumber = useCallback(() => {
    const recent = filteredCalls.find((call) => {
      if (String(call?.direction || '').toLowerCase() === 'inbound') return false;
      const value = call?.to_number || call?.toNumber || call?.phoneNumber || '';
      return String(value).trim() !== '';
    });
    return recent?.to_number || recent?.toNumber || recent?.phoneNumber || '';
  }, [filteredCalls]);
  const filteredChats = useMemo(() => {
    const archived = new Set(loadArchivedPhones(archiveUserKey).map(recentsNormPhone));
    return (chats || []).filter((chat) => {
      const lastMessage = String(chat?.lastMessage || chat?.message || '').trim();
      if (!lastMessage) return false;
      if (/^(inbound|outbound|incoming|outgoing)\s+call$/i.test(lastMessage)) return false;
      const p = chat.phoneNumber || chat.phone_number || '';
      if (archived.has(recentsNormPhone(p))) return false;
      return true;
    });
  }, [chats, archiveUserKey, archiveTick]);

  const archivedPhonesCount = useMemo(
    () => loadArchivedPhones(archiveUserKey).length,
    [archiveUserKey, archiveTick]
  );

  // Combine calls and chats into chronological timeline (backend: callType, createdAt, durationFormatted)
  const combinedRecents = [
    ...filteredCalls.map(call => ({
      id: call.id || call._id,
      type: 'call',
      phoneNumber: call.phoneNumber || call.to_number || call.toNumber,
      date: call.createdAt || call.created_at || call.date,
      direction: call.direction,
      callType: call.callType || call.type,
      durationFormatted: call.durationFormatted,
      durationSeconds: call.durationSeconds,
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

  // Refresh recents only when a call ends (not on initial mount)
  const wasInCallRef = useRef(false);
  useEffect(() => {
    const wasInCall = wasInCallRef.current;
    if (isInCall || calling) {
      wasInCallRef.current = true;
    } else {
      if (wasInCall) {
        notifySubscriptionChanged({ reason: 'call-ended' });
        fetchRecents(false);
      }
      wasInCallRef.current = false;
    }
  }, [calling, fetchRecents, isInCall]);

  useEffect(() => {
    if (selectedChat && mobileTab === 'chats') {
      document.body.setAttribute('data-chat-open', 'true');
    } else {
      document.body.removeAttribute('data-chat-open');
    }
    return () => {
      document.body.removeAttribute('data-chat-open');
    };
  }, [selectedChat, mobileTab]);

  useEffect(() => {
    const handleCloseChat = () => {
      if (selectedChat && mobileTab === 'chats') {
        setSelectedChat(null);
      }
    };
    window.addEventListener('closeChat', handleCloseChat);
    return () => window.removeEventListener('closeChat', handleCloseChat);
  }, [selectedChat, mobileTab]);

  useEffect(() => {
    if (!messageActionMenu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMessageActionMenu(null);
    };
    const onDoc = (e) => {
      if (messageActionMenuRef.current && !messageActionMenuRef.current.contains(e.target)) {
        setMessageActionMenu(null);
      }
    };
    const t = window.setTimeout(() => {
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onDoc, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc, true);
    };
  }, [messageActionMenu]);

  useEffect(() => {
    if (!chatListActionMenu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setChatListActionMenu(null);
    };
    const onDoc = (e) => {
      if (chatListActionMenuRef.current && !chatListActionMenuRef.current.contains(e.target)) {
        setChatListActionMenu(null);
      }
    };
    const t = window.setTimeout(() => {
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onDoc, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc, true);
    };
  }, [chatListActionMenu]);

  useEffect(() => {
    if (!mobileThreadOverflowMenu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileThreadOverflowMenu(null);
    };
    const onDoc = (e) => {
      const menuEl = mobileThreadOverflowMenuRef.current;
      const btnEl = mobileThreadOverflowBtnRef.current;
      if (
        menuEl &&
        !menuEl.contains(e.target) &&
        btnEl &&
        !btnEl.contains(e.target)
      ) {
        setMobileThreadOverflowMenu(null);
      }
    };
    const t = window.setTimeout(() => {
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onDoc, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc, true);
    };
  }, [mobileThreadOverflowMenu]);

  useEffect(() => {
    setMobileThreadOverflowMenu(null);
  }, [selectedChat]);

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
    const autoDialNumber = !number && !phoneNumber.trim() ? getLastDialableNumber() : '';
    const rawNumber = number || autoDialNumber || phoneNumber.trim();
    
    if (!rawNumber) {
      alert('Please enter a phone number');
      return;
    }
    
    if (calling || isInCall) return;

    // Automatically prefix selected country code if user didn't type + code
    const targetNumber = rawNumber.startsWith('+')
      ? rawNumber
      : `${dialCountryCode}${rawNumber}`;
      
    if (!canUseService) {
      alert('No subscription found. Subscribe to make calls.');
      return;
    }
    if (userNumbers.length === 0) {
      alert('You need to purchase a number first');
      return;
    }

    if (!isMountedRef.current) return;
    
    // Get caller ID
    const callerId = userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || userNumbers?.[0];

    try {
      setCalling(true);
      const success = await webrtcMakeCall(targetNumber, callerId);
      if (!isMountedRef.current) return;

      if (success && !number) {
        setPhoneNumber('');
      }

      if (!success && !isInCall) {
        setTimeout(() => {
          if (!callContext?.isInCall) {
            // Error is already in context
          }
        }, 500);
      }
    } catch (err) {
      alert(err.message || 'Failed to place call');
    } finally {
      if (isMountedRef.current) setCalling(false);
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

  // Send message inline
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || !selectedChat || smsSendLockRef.current) return;

    if (userNumbers.length === 0) {
      setSendError('You need to purchase a number first.');
      return;
    }

    const messageText = inputMessage.trim();
    const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nowIso = new Date().toISOString();
    const optimistic = {
      id: optimisticId,
      type: 'message',
      _localPending: true,
      direction: 'outbound',
      sender: 'user',
      status: 'sending',
      message: messageText,
      text: messageText,
      body: messageText,
      timestamp: nowIso,
      created_at: nowIso
    };
    setChatMessages((prev) =>
      [...prev, optimistic].sort(
        (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
      )
    );
    setInputMessage('');
    setSendError('');
    smsSendLockRef.current = true;

    try {
      const response = await API.post('/api/sms/send', {
        to: selectedChat,
        text: messageText
      });

      if (response.error) {
        setChatMessages((prev) => prev.filter((x) => x.id !== optimisticId));
        setSendError(response.error);
        setInputMessage(messageText);
      } else {
        notifySubscriptionChanged();
        await Promise.all([fetchChatMessages(selectedChat), fetchRecents(false), refreshSubscription()]);
      }
    } catch (err) {
      setChatMessages((prev) => prev.filter((x) => x.id !== optimisticId));
      setSendError('Failed to send message. Please try again.');
      setInputMessage(messageText);
    } finally {
      smsSendLockRef.current = false;
    }
  };

  /** lg+: Enter sends, Shift+Enter newline. Below lg: Enter is newline; send via button only. */
  const handleMessageComposerKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (!isLgDesktopVoice) return;
    e.preventDefault();
    if (!inputMessage.trim() || smsSendLockRef.current) return;
    void handleSendMessage(e);
  };

  const normPhone = (n) => (n || '').replace(/\D/g, '');
  const getUnreadCount = (phoneNumber) => {
    const n = normPhone(phoneNumber);
    const key = Object.keys(unreadCounts).find((k) => normPhone(k) === n) || phoneNumber;
    return unreadCounts[key] || 0;
  };

  // Get contact name from phone number (saved contacts first, then calls/chats)
  const getContactName = (phoneNumber) => {
    const norm = (n) => (n || '').replace(/\D/g, '');
    const n = norm(phoneNumber);
    const saved = contacts.find(c => norm(c.phoneNumber) === n);
    if (saved?.name) return saved.name;
    const call = calls.find(c => norm(c.to_number || c.toNumber || c.phoneNumber) === n);
    if (call?.contactName || call?.name) return call.contactName || call.name;
    const chat = chats.find(c => norm(c.phoneNumber || c.phone_number) === n);
    if (chat?.contactName || chat?.name) return chat.contactName || chat.name;
    return null;
  };
  getContactNameRef.current = getContactName;

  const favoriteUserKey = user?.id ?? user?._id ?? 'anon';

  const getBubblePlainText = (item) => String(item?.message || item?.body || item?.text || '').trim();

  const showActionToast = (msg) => {
    setActionToast(msg);
    window.setTimeout(() => setActionToast(''), 2500);
  };

  const clearBubbleLongPress = () => {
    if (longPressBubbleTimerRef.current) {
      clearTimeout(longPressBubbleTimerRef.current);
      longPressBubbleTimerRef.current = null;
    }
  };

  const openMessageActionMenuAt = (clientX, clientY, text) => {
    const body = String(text || '').trim();
    if (!body) return;
    setMessageActionMenu({ clientX, clientY, text: body });
  };

  const startBubbleLongPressFromEvent = (e, text) => {
    clearBubbleLongPress();
    const body = String(text || '').trim();
    if (!body) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    longPressBubbleTimerRef.current = setTimeout(() => {
      longPressBubbleTimerRef.current = null;
      openMessageActionMenuAt(cx, cy, body);
    }, 520);
  };

  const bubbleLongPressHandlers = (text) => ({
    onMouseDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      startBubbleLongPressFromEvent(e, text);
    },
    onMouseUp: clearBubbleLongPress,
    onMouseLeave: clearBubbleLongPress,
    onTouchStart: (e) => startBubbleLongPressFromEvent(e, text),
    onTouchEnd: clearBubbleLongPress,
    onTouchCancel: clearBubbleLongPress,
    onContextMenu: (e) => {
      e.preventDefault();
      const body = String(text || '').trim();
      if (!body) return;
      openMessageActionMenuAt(e.clientX, e.clientY, body);
    },
  });

  const handleMessageMenuCopy = async () => {
    const t = messageActionMenu?.text;
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      showActionToast('Copied');
    } catch {
      showActionToast('Could not copy');
    }
    setMessageActionMenu(null);
  };

  const handleMessageMenuFavorite = () => {
    const t = messageActionMenu?.text;
    if (!t || !selectedChat) return;
    const next = addSmsFavorite(favoriteUserKey, { text: t, peerPhone: selectedChat });
    setFavoriteEntries(next);
    showActionToast('Saved to favorites');
    setMessageActionMenu(null);
  };

  const handleMessageMenuForward = () => {
    const t = messageActionMenu?.text;
    if (!t) return;
    setForwardText(t);
    setMessageActionMenu(null);
  };

  const openFavoritesForThread = () => {
    const all = loadSmsFavorites(favoriteUserKey);
    const forThread = selectedChat
      ? all.filter((x) => normPhone(x.peerPhone) === normPhone(selectedChat))
      : all;
    setFavoriteEntries(forThread);
    setFavoritesModalOpen(true);
  };

  const removeFavoriteEntry = (id) => {
    removeSmsFavorite(favoriteUserKey, id);
    const all = loadSmsFavorites(favoriteUserKey);
    setFavoriteEntries(
      selectedChat ? all.filter((x) => normPhone(x.peerPhone) === normPhone(selectedChat)) : all
    );
  };

  const executeForwardToPeer = async (peerPhone) => {
    const text = (forwardText || '').trim();
    if (!text || !peerPhone) return;
    if (userNumbers.length === 0) {
      showActionToast('Add a number to send SMS');
      setForwardText(null);
      return;
    }
    if (!canUseService) {
      showActionToast('Subscription required');
      setForwardText(null);
      return;
    }
    setForwardText(null);
    try {
      const res = await API.post('/api/sms/send', { to: peerPhone, text });
      if (res.error) {
        showActionToast(res.error || 'Forward failed');
        return;
      }
      notifySubscriptionChanged();
      showActionToast('Sent');
      await Promise.all([fetchRecents(false), refreshSubscription()]);
      if (selectedChat && normPhone(selectedChat) === normPhone(peerPhone)) {
        await fetchChatMessages(peerPhone);
      }
    } catch {
      showActionToast('Forward failed');
    }
  };

  // Delete chat (messages for one thread) - wired to backend
  const handleDeleteChat = async (phoneNumber) => {
    if (!phoneNumber || deleting) return;
    setDeleting(true);
    try {
      const encoded = encodeURIComponent(phoneNumber);
      const res = await API.delete(`/api/messages/thread/${encoded}`);
      if (res?.data?.success !== false && !res?.error) {
        if (selectedChat === phoneNumber) {
          setSelectedChat(null);
          setChatMessages([]);
        }
        unarchiveSmsChat(archiveUserKey, phoneNumber);
        setArchiveTick((x) => x + 1);
        await fetchRecents(false);
        setDeleteChatTarget(null);
      } else {
        alert(res?.data?.error || res?.error || 'Failed to delete conversation');
      }
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Failed to delete conversation');
    } finally {
      setDeleting(false);
    }
  };

  // Delete all call history - wired to backend
  const handleDeleteCallHistory = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await API.delete('/api/calls');
      if (res?.data?.success !== false && !res?.error) {
        await fetchRecents(false);
        setDeleteCallHistoryConfirm(false);
      } else {
        alert(res?.data?.error || res?.error || 'Failed to delete call history');
      }
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Failed to delete call history');
    } finally {
      setDeleting(false);
    }
  };

  const clearChatRowLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openChatListActionMenuAt = (clientX, clientY, phoneNumber) => {
    const p = String(phoneNumber || '').trim();
    if (!p) return;
    setChatListActionMenu({ clientX, clientY, phoneNumber: p });
    suppressChatRowOpenUntilRef.current = Date.now() + 450;
  };

  const startChatRowLongPress = (e, phoneNumber) => {
    clearChatRowLongPressTimer();
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      openChatListActionMenuAt(cx, cy, phoneNumber);
    }, 520);
  };

  const endChatRowLongPress = () => {
    clearChatRowLongPressTimer();
  };

  const tryOpenChatFromRow = (phoneNumber) => {
    if (!phoneNumber) return;
    if (Date.now() < suppressChatRowOpenUntilRef.current) return;
    handleText(phoneNumber);
  };

  const handleChatListMenuSave = () => {
    if (!chatListActionMenu?.phoneNumber) return;
    openSaveContactModal(chatListActionMenu.phoneNumber);
    setChatListActionMenu(null);
  };

  const handleChatListMenuArchive = () => {
    if (!chatListActionMenu?.phoneNumber) return;
    const p = chatListActionMenu.phoneNumber;
    archiveSmsChat(archiveUserKey, p);
    setArchiveTick((x) => x + 1);
    if (selectedChat && recentsNormPhone(selectedChat) === recentsNormPhone(p)) {
      setSelectedChat(null);
      setChatMessages([]);
    }
    showActionToast('Chat archived');
    setChatListActionMenu(null);
  };

  const handleChatListMenuDelete = () => {
    if (!chatListActionMenu?.phoneNumber) return;
    setDeleteChatTarget(chatListActionMenu.phoneNumber);
    setChatListActionMenu(null);
  };

  // Save to contacts (backend-synced, visible on mobile + desktop)
  const openSaveContactModal = (number) => {
    setSaveContactNumber(number || phoneNumber || '');
    setSaveContactName(getContactName(number || phoneNumber) || '');
    setShowSaveContactModal(true);
  };
  const handleSaveContact = async (e) => {
    e?.preventDefault();
    const name = (saveContactName || '').trim();
    const num = (saveContactNumber || '').trim();
    if (!name || !num) return;
    setSavingContact(true);
    try {
      const res = await API.post('/api/contacts', { name, phoneNumber: num });
      if (res?.data?.success !== false && !res?.error) {
        await fetchContacts();
        setShowSaveContactModal(false);
        setSaveContactNumber('');
        setSaveContactName('');
      } else {
        alert(res?.data?.error || res?.error || 'Failed to save contact');
      }
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Failed to save contact');
    } finally {
      setSavingContact(false);
    }
  };

  // Import from phone contacts (mobile: Contact Picker API)
  const handleImportFromPhone = async () => {
    if (importingContacts) return;
    if (!('contacts' in navigator) || typeof navigator.contacts?.select !== 'function') {
      alert('Import from phone is only available on supported mobile browsers (e.g. Chrome on Android).');
      return;
    }
    setImportingContacts(true);
    try {
      const selected = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      if (!selected?.length) {
        setImportingContacts(false);
        return;
      }
      const list = selected.map((c) => ({
        name: (Array.isArray(c.name) && c.name[0]) ? c.name[0] : 'Unknown',
        phoneNumber: (Array.isArray(c.tel) && c.tel[0]) ? String(c.tel[0]).replace(/\s/g, '') : ''
      })).filter((c) => c.phoneNumber);
      if (list.length === 0) {
        setImportingContacts(false);
        return;
      }
      const res = await API.post('/api/contacts/import', { contacts: list });
      if (res?.data?.success !== false && !res?.error) {
        await fetchContacts();
        alert(`Imported ${res?.data?.imported ?? list.length} contact(s). They will appear on desktop too.`);
      } else {
        alert(res?.data?.error || res?.error || 'Failed to import contacts');
      }
    } catch (err) {
      if (err?.name !== 'SecurityError' && err?.name !== 'InvalidStateError') {
        alert(err?.message || 'Failed to import contacts. Try on a supported mobile browser.');
      }
    } finally {
      setImportingContacts(false);
    }
  };

  // Delete a single call - wired to backend
  const handleDeleteCall = async (callId) => {
    if (!callId || deleting) return;
    setDeleting(true);
    try {
      const res = await API.delete(`/api/calls/${callId}`);
      if (res?.data?.success !== false && !res?.error) {
        await fetchRecents(false);
        setDeleteCallTarget(null);
      } else {
        alert(res?.data?.error || res?.error || 'Failed to delete call');
      }
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Failed to delete call');
    } finally {
      setDeleting(false);
    }
  };

  // Mobile Bottom Navigation Component
  const MobileBottomNav = () => (
    <div className="fixed bottom-0 left-0 right-0 safe-area-bottom z-40 lg:hidden">
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

  const toggleMobileThreadOverflowMenu = () => {
    if (mobileThreadOverflowMenu) {
      setMobileThreadOverflowMenu(null);
      return;
    }
    const el = mobileThreadOverflowBtnRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    setMobileThreadOverflowMenu({
      top: r.bottom + 8,
      right: Math.max(8, window.innerWidth - r.right),
    });
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white dark:bg-slate-900">
      {/* Desktop View - 3 panels: Chats list | Inline Chat / Empty | Dialer (same theme as mobile) */}
      <div className="hidden lg:flex flex-1 overflow-hidden min-h-0">
        {/* Left Panel - Recent Chats (same as mobile Chats/Recents tabs) */}
        <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800 min-h-0">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Voice</h1>
            <VoiceSubscriptionStrip
              active={billingUiActive}
              data={subscriptionData}
              onOpenDetails={() => navigate('/subscription-details')}
            />
            <div className="flex gap-2 mb-3">
              <button onClick={() => setActiveTab('chats')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'chats' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>Chats</button>
              <button onClick={() => setActiveTab('all')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'all' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-md' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>Recents</button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleNewChat} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center justify-center gap-2 text-sm">
                <PlusIcon className="w-4 h-4" /> New chat
              </button>
              <button 
                onClick={() => navigate('/contacts')} 
                className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 font-medium flex items-center justify-center gap-2 text-sm transition-colors"
                title="View Contacts"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
            </div>
            {activeTab === 'all' && combinedRecents.some(r => r.type === 'call') && (
              <button onClick={() => setDeleteCallHistoryConfirm(true)} className="mt-2 w-full py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium flex items-center justify-center gap-2 text-sm">
                <TrashIcon className="w-4 h-4" /> Clear call history
              </button>
            )}
            {activeTab === 'chats' && archivedPhonesCount > 0 && (
              <button
                type="button"
                onClick={() => setArchivedChatsModalOpen(true)}
                className="mt-2 w-full py-1.5 text-left text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Archived ({archivedPhonesCount})
              </button>
            )}
          </div>

          {/* Calls/Chats List */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'chats' ? (
              filteredChats.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-300">
                  <p>No recent chats</p>
                </div>
              ) : (
                filteredChats.map((chat) => {
                  const phoneNumber = chat.phoneNumber || chat.phone_number || '';
                  const contactName = getContactName(phoneNumber) || chat.contactName || chat.name;
                  const displayName = contactName || phoneNumber || 'Unknown';
                  const isSelected = selectedChat === phoneNumber;
                  const unread = getUnreadCount(phoneNumber);
                  return (
                    <div
                      key={chat.id}
                      className={`flex items-center px-4 py-3 border-b border-gray-100/80 dark:border-slate-700/80 transition-colors ${
                        isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-white dark:bg-slate-800 hover:bg-gray-50/80 dark:hover:bg-slate-700/50'
                      }`}
                      onTouchStart={(e) => startChatRowLongPress(e, phoneNumber)}
                      onTouchEnd={endChatRowLongPress}
                      onTouchCancel={endChatRowLongPress}
                      onMouseDown={(e) => startChatRowLongPress(e, phoneNumber)}
                      onMouseUp={endChatRowLongPress}
                      onMouseLeave={endChatRowLongPress}
                    >
                      <div
                        onClick={() => phoneNumber && tryOpenChatFromRow(phoneNumber)}
                        className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            tryOpenChatFromRow(phoneNumber);
                          }
                        }}
                      >
                        <div className="relative flex-shrink-0">
                        <Avatar name={displayName} phoneNumber={phoneNumber} size="w-11 h-11" className="ring-1 ring-gray-200/50 dark:ring-slate-600/50" />
                          {unread > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-0.5">
                            <span className={`font-medium truncate text-sm ${unread > 0 ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-900 dark:text-white'}`}>{displayName}</span>
                            <span className="text-[11px] text-gray-400 dark:text-gray-400 flex-shrink-0">{formatDate(chat.date)}</span>
                          </div>
                          <p className={`text-[11px] truncate ${unread > 0 ? 'text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>{chat.lastMessage || 'No messages'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              // Combined chronological timeline (Recents)
              combinedRecents.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-300">
                  <p>No recent activity</p>
                </div>
              ) : (
                combinedRecents.map((item) => {
                  const phoneNumber = item.phoneNumber || '';
                  const contactName = getContactName(phoneNumber) || item.data?.contactName || item.data?.name;
                  const displayName = contactName || phoneNumber || 'Unknown';
                  const isSelected = selectedChat === phoneNumber;
                  const isCall = item.type !== 'sms';
                  return (
                    <div
                      key={item.id}
                      className={`group px-4 py-3 border-b border-gray-100/80 dark:border-slate-700/80 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-white dark:bg-slate-800 hover:bg-gray-50/80 dark:hover:bg-slate-700/50'
                      }`}
                      onClick={() => phoneNumber && handleText(phoneNumber)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <Avatar name={displayName} phoneNumber={phoneNumber} size="w-11 h-11" className="ring-1 ring-gray-200/50 dark:ring-slate-600/50" />
                          {item.type === 'sms' ? (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-indigo-500 rounded-full p-0.5 border border-white dark:border-slate-800">
                              <MessageIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          ) : item.callType === 'missed' ? (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-rose-500 rounded-full p-0.5 border border-white dark:border-slate-800">
                              <PhoneMissedIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          ) : item.direction === 'inbound' ? (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full p-0.5 border border-white dark:border-slate-800">
                              <PhoneInIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          ) : (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-sky-500 rounded-full p-0.5 border border-white dark:border-slate-800">
                              <PhoneOutIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-0.5">
                            <span className="font-medium text-gray-900 dark:text-white truncate text-sm">{displayName}</span>
                            <span className="text-[11px] text-gray-400 dark:text-gray-400 flex-shrink-0 tabular-nums">{formatDateTime(item.date)}</span>
                          </div>
                          <div className="flex items-center flex-wrap gap-x-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                            {item.type === 'sms' ? (
                              <span className="truncate">{item.lastMessage || 'SMS'}</span>
                            ) : (
                              <>
                                <span className="font-medium text-gray-600 dark:text-gray-300">{item.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</span>
                                <span className="text-gray-300 dark:text-gray-600">·</span>
                                <span className="tabular-nums">{item.durationFormatted || formatDuration(item.durationSeconds)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {isCall && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/80 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCall(phoneNumber); }}
                            disabled={calling || !canUseService || userNumbers.length === 0}
                            className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <PhoneIcon className="w-3.5 h-3.5" />
                            Call
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleText(phoneNumber); }}
                            className="flex-1 py-1.5 px-2.5 bg-slate-600 hover:bg-slate-700 dark:bg-slate-500 dark:hover:bg-slate-600 text-white rounded-lg flex items-center justify-center gap-1 text-xs font-medium"
                          >
                            <MessageIcon className="w-3.5 h-3.5" />
                            Text
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openSaveContactModal(phoneNumber); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                            title="Save to contacts"
                          >
                            <PlusIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteCallTarget(item.id); }}
                            disabled={deleting}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            title="Delete this call"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* Center Panel - Inline Chat or empty (desktop lg+) — iMessage-style */}
        <div className={`flex flex-1 flex-col border-r border-black/[0.06] dark:border-slate-700 min-w-0 min-h-0 ${IOS_CHAT_SURFACE}`}>
          {selectedChat ? (
            <div className="flex flex-1 flex-col min-h-0 font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]">
              <div className={`px-3 py-2.5 flex items-center justify-between flex-shrink-0 gap-2 ${IOS_NAV_DESKTOP}`}>
                <h2 className="text-[17px] font-semibold text-black dark:text-white truncate min-w-0 tracking-tight">
                  {getContactName(selectedChat) || selectedChat}
                </h2>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => handleCall(selectedChat)}
                    disabled={calling || !canUseService || userNumbers.length === 0}
                    className="p-2 rounded-full text-[#007AFF] hover:bg-black/[0.04] dark:hover:bg-slate-700/60 disabled:opacity-40"
                    title="Call"
                  >
                    <PhoneIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => openSaveContactModal(selectedChat)}
                    className="p-2 rounded-full text-[#8E8E93] hover:bg-black/[0.04] dark:hover:bg-slate-700/60"
                    title="Save to contacts"
                  >
                    <PlusIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openFavoritesForThread()}
                    className="p-2 rounded-full text-[#8E8E93] hover:bg-black/[0.04] dark:hover:bg-slate-700/60"
                    title="Saved messages for this chat"
                  >
                    <StarIcon className="w-5 h-5" filled />
                  </button>
                  <button
                    onClick={() => setDeleteChatTarget(selectedChat)}
                    disabled={deleting}
                    className="p-2 rounded-full text-[#8E8E93] hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400"
                    title="Delete conversation"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
                {chatLoading && chatMessages.length === 0 ? (
                  <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-12">
                    <p>Loading messages…</p>
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-12">
                    <MessageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p>No messages yet</p>
                    <p className="text-xs mt-2">Start a conversation</p>
                  </div>
                ) : (
                  chatMessages.map((item, idx) => {
                    if (item.type === 'call') {
                      const isOutbound = item.direction === 'outbound';
                      const isMissed = (item.status || '') === 'missed';
                      const isFailed = (item.status || '') === 'failed';
                      const durationSeconds = item.duration || item.durationSeconds || 0;
                      const durationStr = formatDuration(durationSeconds);
                      const ts = item.timestamp || item.createdAt || item.created_at;
                      let callLabel = 'Voice call';
                      if (isMissed) callLabel = 'Missed call'; else if (isFailed) callLabel = 'Failed call'; else if (isOutbound) callLabel = 'Outgoing call'; else callLabel = 'Incoming call';
                      return (
                        <div key={`call-${item.id || idx}`} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[85%] rounded-[1.125rem] px-3.5 py-2.5 shadow-sm ${
                              isMissed || isFailed
                                ? 'bg-red-100/90 dark:bg-red-900/35 text-red-900 dark:text-red-100'
                                : 'bg-white/90 dark:bg-slate-800 text-black dark:text-white shadow-black/5'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 flex-wrap">
                              {isOutbound ? <PhoneOutIcon className="w-4 h-4 flex-shrink-0 opacity-70" /> : <PhoneInIcon className="w-4 h-4 flex-shrink-0 opacity-70" />}
                              <div className="min-w-0">
                                <p className="text-[15px] font-medium leading-snug">{callLabel}</p>
                                <p className="text-[12px] text-[#8E8E93] dark:text-slate-400 mt-0.5">Duration: {durationStr}</p>
                                <p className="text-[11px] text-[#8E8E93] dark:text-slate-500 mt-0.5">{formatDateTime(ts)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const isOutbound = item.direction === 'outbound' || item.sender === 'user';
                    const isPending = Boolean(item._localPending) || item.status === 'sending';
                    return (
                      <div key={`msg-${item.id || idx}`} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] px-3.5 py-2 select-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] dark:shadow-none ${
                            isOutbound
                              ? `rounded-[1.125rem] rounded-br-[0.25rem] bg-[#007AFF] text-white ${isPending ? 'opacity-85 ring-1 ring-white/30' : ''}`
                              : 'rounded-[1.125rem] rounded-bl-[0.25rem] bg-[#E9E9EB] text-black dark:bg-slate-700 dark:text-white shadow-[0_1px_0.5px_rgba(0,0,0,0.08)]'
                          }`}
                          {...bubbleLongPressHandlers(getBubblePlainText(item))}
                        >
                          <p className="text-[17px] leading-snug whitespace-pre-wrap break-words">{item.message || item.body || item.text}</p>
                          <p
                            className={`text-[11px] mt-1 flex flex-wrap items-center gap-x-2 ${
                              isOutbound ? 'text-white/65' : 'text-[#8E8E93] dark:text-slate-400'
                            }`}
                          >
                            <span>{formatDate(item.timestamp || item.created_at)}</span>
                            {isOutbound && isPending && (
                              <span title="Sending or network slow">Sending…</span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              {sendError && (
                <div className="px-4 py-2 bg-red-500/10 dark:bg-red-900/25 text-red-700 dark:text-red-200 text-sm flex-shrink-0 border-t border-red-200/50 dark:border-red-800/50">
                  {isSuspiciousActivityError(sendError) ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span>{suspiciousActivityText}</span>
                      <button
                        type="button"
                        onClick={() => navigate('/support')}
                        className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                      >
                        Contact Support
                      </button>
                    </div>
                  ) : (
                    sendError
                  )}
                </div>
              )}
              <div className={`px-2 py-2 flex-shrink-0 ${IOS_COMPOSER}`}>
                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  <textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleMessageComposerKeyDown}
                    placeholder="Message"
                    title={
                      isLgDesktopVoice
                        ? 'Shift+Enter new line · Enter to send'
                        : 'New line: Enter · Send: tap the send button'
                    }
                    rows={1}
                    className="flex-1 min-h-[2.75rem] max-h-36 resize-none rounded-[1.25rem] bg-white dark:bg-slate-800 px-3.5 py-2 text-[17px] text-black dark:text-white placeholder:text-[#8E8E93] dark:placeholder:text-slate-500 border-0 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:focus:ring-indigo-500/40 leading-snug shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim()}
                    className="mb-0.5 h-9 w-9 shrink-0 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow-sm hover:bg-[#0066DB] disabled:bg-[#C7C7CC] dark:disabled:bg-[#48484A] disabled:cursor-not-allowed transition-colors"
                    title="Send"
                  >
                    <IosSendArrowIcon className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 min-h-0">
              <div className="text-center px-6">
                <MessageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-600 dark:text-gray-300 font-medium">Select a chat to view conversation</p>
                <p className="text-sm mt-1">Or start a new chat from the list</p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: dialer + in-column call UI (lg+); GlobalCallOverlay skips /recents at this width */}
        <div className="flex w-72 flex-shrink-0 flex-col bg-gray-50 dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 min-h-0 overflow-hidden relative xl:w-80">
            <>
          {isLgDesktopVoice && <ActiveCallChrome isDesktop dockMode />}
          {(userNumbers.length === 0 ||
            (subscriptionKnown && !canUseService) ||
            (subscriptionKnown && canUseService && !subscriptionUsable)) && (
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 flex-shrink-0">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {subscriptionKnown && !canUseService && '⚠️ No subscription found. '}
                {subscriptionKnown &&
                  canUseService &&
                  !subscriptionUsable &&
                  'ℹ️ Subscription inactive — remaining balance available. '}
                {userNumbers.length === 0 && '⚠️ No phone number purchased.'}
              </p>
            </div>
          )}
          <div className="px-4 py-2 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Your Number</div>
              <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || 'None'}
              </div>
            </div>
            <VoiceSubscriptionStrip
              active={billingUiActive}
              data={subscriptionData}
              onOpenDetails={() => navigate('/subscription-details')}
              variant="inline"
            />
          </div>
          <div className="px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <div className="flex items-center gap-2">
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
                    <div className="fixed inset-0 z-30" onClick={() => setShowDialCountryDropdown(false)} />
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
              <div className="relative flex-1">
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^\d+*#]/g, '');
                    setPhoneNumber(cleaned);
                  }}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    handleKeyDown(e);
                    if (e.key === 'Enter' && (phoneNumber.trim() || getLastDialableNumber()) && !calling && canUseService && userNumbers.length > 0) handleCall();
                  }}
                  placeholder="Enter phone number"
                  className="w-full text-lg font-semibold text-gray-900 dark:text-white h-10 px-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 outline-none placeholder:text-gray-400 disabled:opacity-50"
                  disabled={calling || !canUseService || userNumbers.length === 0}
                />
                {phoneNumber && (
                  <button
                    type="button"
                    onClick={() => setPhoneNumber('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 dark:text-gray-400"
                    aria-label="Clear number"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {phoneNumber.trim() && (
              <div className="px-4 pb-2 flex-shrink-0">
                <button type="button" onClick={() => openSaveContactModal()} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                  Save to contacts
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 min-h-0 flex flex-col justify-center">
            <div className="grid grid-cols-3 gap-2">
              {dialpadButtons.map((btn) => {
                let pressTimer = null;
                return (
                  <button
                    key={btn.digit}
                    onClick={() => handleDialpadClick(btn.digit)}
                    onMouseDown={() => { if (btn.digit === '0') pressTimer = setTimeout(() => handleLongPress('0'), 500); }}
                    onMouseUp={() => pressTimer && clearTimeout(pressTimer)}
                    onMouseLeave={() => pressTimer && clearTimeout(pressTimer)}
                    onTouchStart={() => { if (btn.digit === '0') pressTimer = setTimeout(() => handleLongPress('0'), 500); }}
                    onTouchEnd={() => pressTimer && clearTimeout(pressTimer)}
                    disabled={calling || !canUseService || userNumbers.length === 0}
                    className="aspect-square w-full bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600 rounded-full border border-gray-200 dark:border-slate-700 transition-all active:scale-[0.96] text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center"
                  >
                    <span className="text-2xl font-bold leading-none">{btn.digit}</span>
                    {btn.letters && (
                      <span className="text-[7px] font-medium text-gray-500 dark:text-gray-400 mt-0.5 leading-tight uppercase tracking-wide">{btn.letters}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
              <button
                onClick={handleBackspace}
                disabled={!phoneNumber || calling}
                className="w-12 h-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.96]"
              >
                <BackspaceIcon className="w-4 h-4" />
              </button>
              {phoneNumber.trim() && (
                <button
                  type="button"
                  onClick={() => openSaveContactModal()}
                  className="w-12 h-12 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-medium"
                  title="Save to contacts"
                >
                  Save
                </button>
              )}
              <button
                onClick={() => handleCall()}
                disabled={(!phoneNumber.trim() && !getLastDialableNumber()) || calling || userNumbers.length === 0 || !canUseService}
                className="w-12 h-12 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.96] shadow-sm hover:shadow-md"
                title={phoneNumber.trim() ? 'Call' : 'Autodial last number'}
              >
                {calling ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <PhoneIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
            </>
        </div>
      </div>

      {/* Mobile / tablet: single-column Voice (hidden on lg+ where 3-panel layout is used) */}
      <div className="flex flex-1 min-h-0 flex-col lg:hidden">
        {/* Mobile Header - Hidden on dialer tab */}
        {mobileTab !== 'dialer' && (
          <div
            className={`px-2 flex items-center justify-between sticky top-0 z-20 h-14 min-h-[3.5rem] ${
              selectedChat ? IOS_NAV_MOBILE : 'border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            }`}
          >
            {selectedChat ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedChat(null)}
                  className="p-2 -ml-1 rounded-full text-[#007AFF] hover:bg-black/[0.04] dark:hover:bg-slate-700/60"
                  aria-label="Back"
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 19l-7-7 7-7" />
                  </svg>
                </button>
                <h1 className="text-[17px] font-semibold text-black dark:text-white flex-1 text-center truncate min-w-0 px-1 tracking-tight">
                  {getContactName(selectedChat) || selectedChat}
                </h1>
                <div className="flex items-center gap-0.5 flex-shrink-0 justify-end">
                  <button
                    type="button"
                    onClick={() => handleCall(selectedChat)}
                    disabled={calling || !canUseService || userNumbers.length === 0}
                    className="p-2 rounded-full text-[#007AFF] hover:bg-black/[0.04] dark:hover:bg-slate-700/60 disabled:opacity-40"
                    title="Call"
                  >
                    <PhoneIcon className="w-6 h-6" />
                  </button>
                  <button
                    ref={mobileThreadOverflowBtnRef}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMobileThreadOverflowMenu();
                    }}
                    className="p-2 rounded-full text-[#8E8E93] hover:bg-black/[0.04] dark:hover:bg-slate-700/60"
                    title="More"
                    aria-label="Chat options"
                    aria-expanded={Boolean(mobileThreadOverflowMenu)}
                  >
                    <HorizontalDotsIcon className="w-6 h-6" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-10"></div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex-1 text-center">
            {mobileTab === 'chats' ? 'Chats' : mobileTab === 'recents' ? 'Recents' : 'Dialer'}
          </h1>
                {mobileTab === 'chats' ? (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {archivedPhonesCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setArchivedChatsModalOpen(true)}
                        className="px-1.5 py-1 text-[11px] font-semibold text-[#007AFF] whitespace-nowrap max-w-[5.5rem] truncate"
                        title="Archived chats"
                      >
                        Archived ({archivedPhonesCount})
                      </button>
                    )}
                    <button 
                      onClick={() => navigate('/contacts')} 
                      className="p-2 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" 
                      title="View Contacts"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </button>
                    <button onClick={handleNewChat} className="p-2.5 rounded-full bg-indigo-600 text-white shadow-md hover:shadow-lg hover:bg-indigo-700 active:scale-95 transition-all" title="Start new chat">
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : mobileTab === 'recents' ? (
                  <div className="flex items-center gap-1">
                    <button onClick={handleImportFromPhone} disabled={importingContacts} className="p-2 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50" title="Import from phone contacts">
                      {importingContacts ? <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> : <PlusIcon className="w-5 h-5" />}
                    </button>
                    {(filteredCalls.length > 0 || combinedRecents.some(r => r.type === 'call')) && (
                      <button onClick={() => setDeleteCallHistoryConfirm(true)} disabled={deleting} className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" title="Clear call history">
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="w-10"></div>
                )}
              </>
            )}
        </div>
        )}

        {/* Mobile Tab Content — min-h-0 + nested overflow so thread list and chat both scroll correctly */}
        <div
          className={`flex-1 min-h-0 flex flex-col ${
            mobileTab === 'dialer' ? 'overflow-hidden' : 'overflow-hidden'
          }`}
        >
          {mobileTab === 'chats' && selectedChat ? (
            <div className={`flex flex-1 min-h-0 flex-col font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] ${IOS_CHAT_SURFACE}`}>
              {/* Messages Area */}
                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
                  {chatLoading && chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
                      <p>Loading messages…</p>
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
                      <MessageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p>No messages yet</p>
                      <p className="text-xs mt-2">Start a conversation</p>
                    </div>
                  ) : (
                    chatMessages.map((item, idx) => {
                      // Handle calls - professional muted colors, date/time/duration
                      if (item.type === 'call') {
                        const isOutbound = item.direction === 'outbound';
                        const callStatus = item.status || 'completed';
                        const isMissed = callStatus === 'missed';
                        const isFailed = callStatus === 'failed';
                        const durationSeconds = item.duration || item.durationSeconds || 0;
                        const durationStr = formatDuration(durationSeconds);
                        const ts = item.timestamp || item.createdAt || item.created_at;
                        let callLabel = 'Voice call';
                        if (isMissed) callLabel = 'Missed call';
                        else if (isFailed) callLabel = 'Failed call';
                        else if (isOutbound) callLabel = 'Outgoing call';
                        else callLabel = 'Incoming call';
                        return (
                          <div key={`call-${item.id || item._id || idx}`} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[85%] rounded-[1.125rem] px-3.5 py-2.5 shadow-sm ${
                                isMissed || isFailed
                                  ? 'bg-red-100/90 dark:bg-red-900/35 text-red-900 dark:text-red-100'
                                  : 'bg-white/90 dark:bg-slate-800 text-black dark:text-white shadow-black/5'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 flex-wrap">
                                {isOutbound ? <PhoneOutIcon className="w-4 h-4 flex-shrink-0 opacity-70" /> : <PhoneInIcon className="w-4 h-4 flex-shrink-0 opacity-70" />}
                                <div className="min-w-0">
                                  <p className="text-[15px] font-medium leading-snug">{callLabel}</p>
                                  <p className="text-[12px] text-[#8E8E93] dark:text-slate-400">Duration: {durationStr}</p>
                                  <p className="text-[11px] text-[#8E8E93] dark:text-slate-500 mt-0.5">{formatDateTime(ts)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      
                      // Handle messages
                      const isOutbound = item.direction === 'outbound' || item.sender === 'user';
                      const isPending = Boolean(item._localPending) || item.status === 'sending';
                      return (
                        <div
                          key={`msg-${item.id || item._id || idx}`}
                          className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] px-3.5 py-2 select-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] dark:shadow-none ${
                              isOutbound
                                ? `rounded-[1.125rem] rounded-br-[0.25rem] bg-[#007AFF] text-white ${isPending ? 'opacity-85 ring-1 ring-white/30' : ''}`
                                : 'rounded-[1.125rem] rounded-bl-[0.25rem] bg-[#E9E9EB] text-black dark:bg-slate-700 dark:text-white shadow-[0_1px_0.5px_rgba(0,0,0,0.08)]'
                            }`}
                            {...bubbleLongPressHandlers(getBubblePlainText(item))}
                          >
                            <p className="text-[17px] leading-snug whitespace-pre-wrap break-words">{item.message || item.body || item.text}</p>
                            <p
                              className={`text-[11px] mt-1 flex flex-wrap items-center gap-x-2 ${
                                isOutbound ? 'text-white/65' : 'text-[#8E8E93] dark:text-slate-400'
                              }`}
                            >
                              <span>{formatDate(item.timestamp || item.created_at || item.createdAt)}</span>
                              {isOutbound && isPending && (
                                <span title="Sending or network slow">Sending…</span>
                              )}
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
                <div className="px-4 py-2 bg-red-500/10 dark:bg-red-900/25 text-red-700 dark:text-red-200 text-sm border-t border-red-200/50 dark:border-red-800/50">
                  {isSuspiciousActivityError(sendError) ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span>{suspiciousActivityText}</span>
                      <button
                        type="button"
                        onClick={() => navigate('/support')}
                        className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                      >
                        Contact Support
                      </button>
                    </div>
                  ) : (
                    sendError
                  )}
                </div>
              )}
              <div className={`flex-shrink-0 px-2 py-2 ${IOS_COMPOSER}`}>
                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  <textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleMessageComposerKeyDown}
                    placeholder="Message"
                    title={
                      isLgDesktopVoice
                        ? 'Shift+Enter new line · Enter to send'
                        : 'New line: Enter · Send: tap the send button'
                    }
                    rows={1}
                    className="flex-1 min-h-[2.75rem] max-h-36 resize-none rounded-[1.25rem] bg-white dark:bg-slate-800 px-3.5 py-2 text-[17px] text-black dark:text-white placeholder:text-[#8E8E93] dark:placeholder:text-slate-500 border-0 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:focus:ring-indigo-500/40 leading-snug shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim()}
                    className="mb-0.5 h-9 w-9 shrink-0 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow-sm hover:bg-[#0066DB] disabled:bg-[#C7C7CC] dark:disabled:bg-[#48484A] disabled:cursor-not-allowed transition-colors"
                    title="Send"
                  >
                    <IosSendArrowIcon className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          ) : mobileTab === 'chats' && (
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
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
                  const unread = getUnreadCount(phoneNumber);
                  return (
                    <div
                      key={chat.id}
                      className="flex items-center p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 active:bg-gray-100 dark:active:bg-slate-700 transition-all duration-150"
                      onTouchStart={(e) => startChatRowLongPress(e, phoneNumber)}
                      onTouchEnd={endChatRowLongPress}
                      onTouchCancel={endChatRowLongPress}
                      onMouseDown={(e) => startChatRowLongPress(e, phoneNumber)}
                      onMouseUp={endChatRowLongPress}
                      onMouseLeave={endChatRowLongPress}
                    >
                      <div
                        onClick={() => tryOpenChatFromRow(phoneNumber)}
                        className="flex flex-1 items-center space-x-3 min-w-0 active:scale-[0.98]"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            tryOpenChatFromRow(phoneNumber);
                          }
                        }}
                      >
                        <div className="relative flex-shrink-0">
                        <Avatar name={displayName} phoneNumber={phoneNumber} size="w-12 h-12" />
                          {unread > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] px-1 flex items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`truncate ${unread > 0 ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-900 dark:text-white'}`}>{displayName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-300 ml-2 flex-shrink-0">{formatDate(chat.date)}</span>
                          </div>
                          <p className={`text-sm truncate ${unread > 0 ? 'font-medium text-gray-700 dark:text-gray-200' : 'text-gray-600 dark:text-gray-300'}`}>{chat.lastMessage || 'No messages'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {mobileTab === 'recents' && (
            <div className="bg-white dark:bg-slate-800 min-h-0 overflow-y-auto">
              {combinedRecents.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-300">
                  <ClockIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p>No recent activity</p>
                </div>
              ) : (
                combinedRecents.map((item) => {
                  const phoneNumber = item.phoneNumber || '';
                  const contactName = getContactName(phoneNumber) || item.data?.contactName || item.data?.name;
                  const displayName = contactName || phoneNumber || 'Unknown';
                  const isCall = item.type !== 'sms';
                  return (
                    <div
                      key={item.id}
                      className="px-4 py-3 border-b border-gray-100/80 dark:border-slate-700/80 active:bg-gray-50/80 dark:active:bg-slate-700/50 transition-colors"
                    >
                      <div
                        className="flex items-center gap-3"
                        onClick={() => phoneNumber && handleText(phoneNumber)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); phoneNumber && handleText(phoneNumber); } }}
                      >
                        <div className="relative flex-shrink-0">
                          <Avatar name={displayName} phoneNumber={phoneNumber} size="w-11 h-11" className="ring-1 ring-gray-200/50 dark:ring-slate-600/50" />
                          {item.type === 'sms' ? (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-indigo-500 rounded-full p-0.5 border border-white dark:border-slate-800">
                              <MessageIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          ) : item.callType === 'missed' ? (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-rose-500 rounded-full p-0.5 border border-white dark:border-slate-800">
                              <PhoneMissedIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          ) : item.direction === 'inbound' ? (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full p-0.5 border border-white dark:border-slate-800">
                              <PhoneInIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          ) : (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-sky-500 rounded-full p-0.5 border border-white dark:border-slate-800">
                              <PhoneOutIcon className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-0.5">
                            <span className="font-medium text-gray-900 dark:text-white truncate text-sm">{displayName}</span>
                            <span className="text-[11px] text-gray-400 dark:text-gray-400 flex-shrink-0 tabular-nums">{formatDateTime(item.date)}</span>
                          </div>
                          <div className="flex items-center flex-wrap gap-x-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                            {item.type === 'sms' ? (
                              <span className="truncate">{item.lastMessage || 'SMS'}</span>
                            ) : (
                              <>
                                <span className="font-medium text-gray-600 dark:text-gray-300">{item.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</span>
                                <span className="text-gray-300 dark:text-gray-600">·</span>
                                <span className="tabular-nums">{item.durationFormatted || formatDuration(item.durationSeconds)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {isCall && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/80">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCall(phoneNumber); }}
                            disabled={calling || !canUseService || userNumbers.length === 0}
                            className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg flex items-center justify-center gap-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <PhoneIcon className="w-3.5 h-3.5" />
                            Call
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleText(phoneNumber); }}
                            className="flex-1 py-1.5 px-2.5 bg-slate-600 hover:bg-slate-700 dark:bg-slate-500 dark:hover:bg-slate-600 text-white rounded-lg flex items-center justify-center gap-1 text-xs font-medium"
                          >
                            <MessageIcon className="w-3.5 h-3.5" />
                            Text
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openSaveContactModal(phoneNumber); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                            title="Save to contacts"
                          >
                            <PlusIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteCallTarget(item.id); }}
                            disabled={deleting}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            title="Delete this call"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {mobileTab === 'dialer' && (
            <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-900 relative min-h-0">
              <ActiveCallChrome isDesktop={false} dockMode />
              {/* Debug Info - Shows why calling might be blocked */}
              {(userNumbers.length === 0 ||
                (subscriptionKnown && !canUseService) ||
                (subscriptionKnown && canUseService && !subscriptionUsable)) && (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {subscriptionKnown && !canUseService && '⚠️ No subscription found. '}
                    {subscriptionKnown &&
                      canUseService &&
                      !subscriptionUsable &&
                      'ℹ️ Subscription inactive — remaining balance available. '}
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
                <VoiceSubscriptionStrip
                  active={billingUiActive}
                  data={subscriptionData}
                  onOpenDetails={() => navigate('/subscription-details')}
                  variant="inline"
                />
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
                        if (e.key === 'Enter' && (phoneNumber.trim() || getLastDialableNumber()) && !isCallBusy && canUseService && userNumbers.length > 0) {
                          handleCall();
                        }
                      }}
                      placeholder="Enter phone number"
                      className="w-full text-lg font-semibold text-gray-900 dark:text-white h-12 px-4 text-center bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isCallBusy || !canUseService || userNumbers.length === 0}
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
                        disabled={isCallBusy || !canUseService || userNumbers.length === 0}
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
                      disabled={!phoneNumber || isCallBusy}
                      className="w-12 h-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 
                                 hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600 
                                 text-gray-700 dark:text-gray-200 rounded-full flex items-center justify-center 
                                 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.96]"
                    >
                      <BackspaceIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCall()}
                      disabled={(!phoneNumber.trim() && !getLastDialableNumber()) || calling || userNumbers.length === 0 || !canUseService}
                      className="w-12 h-12 bg-green-500 hover:bg-green-600 active:bg-green-700 
                                 text-white rounded-full flex items-center justify-center 
                                 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.96]
                                 shadow-sm hover:shadow-md"
                      title={phoneNumber.trim() ? 'Call' : 'Autodial last number'}
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

      {/* Delete chat confirmation */}
      {deleteChatTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setDeleteChatTarget(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete conversation?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              All messages with {getContactName(deleteChatTarget) || deleteChatTarget} will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteChatTarget(null)} disabled={deleting} className="flex-1 py-3 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => handleDeleteChat(deleteChatTarget)} disabled={deleting} className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <TrashIcon className="w-5 h-5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete single call confirmation */}
      {deleteCallTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setDeleteCallTarget(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete this call?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This call will be removed from your history. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteCallTarget(null)} disabled={deleting} className="flex-1 py-3 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => handleDeleteCall(deleteCallTarget)} disabled={deleting} className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <TrashIcon className="w-5 h-5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete call history confirmation (clear all) */}
      {deleteCallHistoryConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setDeleteCallHistoryConfirm(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Clear call history?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              All call history will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteCallHistoryConfirm(false)} disabled={deleting} className="flex-1 py-3 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDeleteCallHistory} disabled={deleting} className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <TrashIcon className="w-5 h-5" />}
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save to contacts modal */}
      {showSaveContactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !savingContact && setShowSaveContactModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Save to contacts</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">Saved contacts sync across your devices.</p>
            <form onSubmit={handleSaveContact} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input type="text" value={saveContactName} onChange={(e) => setSaveContactName(e.target.value)} placeholder="Contact name" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number</label>
                <input type="tel" value={saveContactNumber} onChange={(e) => setSaveContactNumber(e.target.value)} placeholder="+1 234 567 8900" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => !savingContact && setShowSaveContactModal(false)} disabled={savingContact} className="flex-1 py-3 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={savingContact} className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingContact ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewChatModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
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

            {/* Chat from contacts */}
            {contacts.length > 0 && (
              <div className="mb-4 flex-shrink-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Choose from contacts</p>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-600 divide-y divide-gray-100 dark:divide-slate-700">
                  {contacts.map((c) => (
                    <button
                      key={c.id || c._id}
                      type="button"
                      onClick={() => {
                        handleText(c.phoneNumber);
                        setShowNewChatModal(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 active:bg-gray-100 dark:active:bg-slate-700 transition-colors"
                    >
                      <Avatar name={c.name} phoneNumber={c.phoneNumber} size="w-10 h-10" className="ring-1 ring-gray-200/50 dark:ring-slate-600/50" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.phoneNumber}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 flex-shrink-0">
              Or enter a phone number
            </p>
            
            <div className="space-y-4 flex-shrink-0">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={newChatNumber}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^\d+*#]/g, '');
                    setNewChatNumber(cleaned);
                  }}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border-2 border-gray-200 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 transition-all"
                  autoFocus={contacts.length === 0}
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

      {messageActionMenu &&
        createPortal(
          <div
            ref={messageActionMenuRef}
            role="menu"
            className="fixed z-[200] min-w-[11rem] rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1 shadow-xl"
            style={{
              left: Math.max(
                8,
                Math.min(messageActionMenu.clientX, (typeof window !== 'undefined' ? window.innerWidth : 400) - 180)
              ),
              top: Math.max(
                8,
                Math.min(messageActionMenu.clientY, (typeof window !== 'undefined' ? window.innerHeight : 400) - 120)
              ),
            }}
          >
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700"
              onClick={() => handleMessageMenuCopy()}
            >
              Copy
            </button>
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700"
              onClick={() => handleMessageMenuForward()}
            >
              Forward
            </button>
            <button
              type="button"
              disabled={!selectedChat}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => handleMessageMenuFavorite()}
            >
              Favorite
            </button>
          </div>,
          document.body
        )}

      {chatListActionMenu &&
        createPortal(
          <div
            ref={chatListActionMenuRef}
            role="menu"
            className="fixed z-[200] min-w-[12rem] rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1 shadow-xl"
            style={{
              left: Math.max(
                8,
                Math.min(chatListActionMenu.clientX, (typeof window !== 'undefined' ? window.innerWidth : 400) - 200)
              ),
              top: Math.max(
                8,
                Math.min(chatListActionMenu.clientY, (typeof window !== 'undefined' ? window.innerHeight : 400) - 160)
              ),
            }}
          >
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700"
              onClick={() => handleChatListMenuSave()}
            >
              Save to contacts
            </button>
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700"
              onClick={() => handleChatListMenuArchive()}
            >
              Archive
            </button>
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => handleChatListMenuDelete()}
            >
              Delete conversation…
            </button>
          </div>,
          document.body
        )}

      {mobileThreadOverflowMenu &&
        selectedChat &&
        createPortal(
          <div
            ref={mobileThreadOverflowMenuRef}
            role="menu"
            aria-label="Chat options"
            className="fixed z-[210] min-w-[12.5rem] max-w-[min(18rem,calc(100vw-1rem))] rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1 shadow-xl"
            style={{
              top: mobileThreadOverflowMenu.top,
              right: mobileThreadOverflowMenu.right,
            }}
          >
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-[15px] text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700"
              onClick={() => {
                openSaveContactModal(selectedChat);
                setMobileThreadOverflowMenu(null);
              }}
            >
              Save to contacts
            </button>
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-[15px] text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700"
              onClick={() => {
                openFavoritesForThread();
                setMobileThreadOverflowMenu(null);
              }}
            >
              Saved messages
            </button>
            <div className="my-1 border-t border-gray-100 dark:border-slate-600" role="separator" />
            <button
              type="button"
              disabled={deleting}
              className="w-full px-4 py-2.5 text-left text-[15px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              onClick={() => {
                setDeleteChatTarget(selectedChat);
                setMobileThreadOverflowMenu(null);
              }}
            >
              Delete conversation
            </button>
          </div>,
          document.body
        )}

      {archivedChatsModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[195] flex items-center justify-center p-4"
          onClick={() => setArchivedChatsModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full max-h-[min(24rem,75vh)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Archived chats</h2>
              <button
                type="button"
                onClick={() => setArchivedChatsModalOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {loadArchivedPhones(archiveUserKey).length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No archived chats</p>
              ) : (
                loadArchivedPhones(archiveUserKey).map((phone) => (
                  <div
                    key={phone}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/60"
                  >
                    <span className="text-sm text-gray-900 dark:text-white truncate min-w-0">{getContactName(phone) || phone}</span>
                    <button
                      type="button"
                      className="text-sm font-semibold text-[#007AFF] shrink-0"
                      onClick={() => {
                        unarchiveSmsChat(archiveUserKey, phone);
                        setArchiveTick((x) => x + 1);
                        showActionToast('Chat restored');
                      }}
                    >
                      Unarchive
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {forwardText != null && forwardText !== '' && (
        <div
          className="fixed inset-0 bg-black/50 z-[190] flex items-center justify-center p-4"
          onClick={() => setForwardText(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full max-h-[min(28rem,85vh)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Forward to</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-3">{forwardText}</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {filteredChats.filter((c) => {
                const p = c.phoneNumber || c.phone_number;
                if (!p) return false;
                if (!selectedChat) return true;
                return normPhone(p) !== normPhone(selectedChat);
              }).length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 p-4 text-center">No other chats to forward to.</p>
              ) : (
                filteredChats
                  .filter((c) => {
                    const p = c.phoneNumber || c.phone_number;
                    if (!p) return false;
                    if (!selectedChat) return true;
                    return normPhone(p) !== normPhone(selectedChat);
                  })
                  .map((c) => {
                    const p = c.phoneNumber || c.phone_number;
                    const label = getContactName(p) || p;
                    return (
                      <button
                        key={c.id || c._id || p}
                        type="button"
                        onClick={() => executeForwardToPeer(p)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-slate-700/80"
                      >
                        <Avatar name={label} phoneNumber={p} size="w-10 h-10" />
                        <span className="font-medium text-gray-900 dark:text-white truncate">{label}</span>
                      </button>
                    );
                  })
              )}
            </div>
            <div className="p-3 border-t border-gray-200 dark:border-slate-700 flex-shrink-0">
              <button
                type="button"
                onClick={() => setForwardText(null)}
                className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {favoritesModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[190] flex items-center justify-center p-4"
          onClick={() => setFavoritesModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full max-h-[min(28rem,85vh)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {selectedChat ? `Saved — ${getContactName(selectedChat) || selectedChat}` : 'Saved messages'}
              </h2>
              <button
                type="button"
                onClick={() => setFavoritesModalOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {favoriteEntries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  Long-press a message and tap Favorite, or use the star in the chat header.
                </p>
              ) : (
                favoriteEntries.map((fav) => (
                  <div
                    key={fav.id}
                    className="rounded-xl border border-gray-200 dark:border-slate-600 p-3 bg-gray-50 dark:bg-slate-900/40"
                  >
                    <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">{fav.text}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                      {fav.savedAt ? new Date(fav.savedAt).toLocaleString() : ''}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeFavoriteEntry(fav.id)}
                      className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {actionToast ? (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[210] px-4 py-2 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium shadow-lg max-w-[90vw] truncate">
          {actionToast}
        </div>
      ) : null}
    </div>
  );
}

export default Recents;

