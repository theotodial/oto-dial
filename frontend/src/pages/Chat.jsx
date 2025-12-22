import { useState, useEffect, useRef } from 'react';
import API from '../api';

// Icons
const SendIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

const AIIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const ChatBubbleIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const PhoneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const MessageIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
  </svg>
);

const CallIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

function Chat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [chatSessions, setChatSessions] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewChat, setIsNewChat] = useState(false);
  const [newChatNumber, setNewChatNumber] = useState('');
  const [numberError, setNumberError] = useState('');
  const [calling, setCalling] = useState(false);
  const [callSuccess, setCallSuccess] = useState('');
  const [callError, setCallError] = useState('');
  const [userNumbers, setUserNumbers] = useState([]);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef(null);

  const user_id = localStorage.getItem('user_id');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchChatData();
    fetchUserNumbers();
  }, []);

  const fetchUserNumbers = async () => {
    if (!user_id) return;
    try {
      const response = await API.get(`/api/numbers/${user_id}`);
      setUserNumbers(response.data || []);
    } catch (err) {
      // Silent fail for user numbers - it's not critical for chat
    }
  };

  const handleCall = async () => {
    if (!selectedChat?.phoneNumber || calling) return;

    const fromNumber = userNumbers.length > 0 ? userNumbers[0].number : null;
    
    if (!fromNumber) {
      setCallError('You need to purchase a number first. Go to Dashboard to buy a number.');
      setTimeout(() => setCallError(''), 5000);
      return;
    }

    setCalling(true);
    setCallError('');
    setCallSuccess('');

    try {
      await API.post('/api/calls', {
        user_id: parseInt(user_id),
        from_number: fromNumber,
        to_number: selectedChat.phoneNumber
      });

      setCallSuccess(`Calling ${selectedChat.phoneNumber}...`);
      setTimeout(() => setCallSuccess(''), 5000);
    } catch (err) {
      setCallError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to make call'
      );
      setTimeout(() => setCallError(''), 5000);
    } finally {
      setCalling(false);
    }
  };

  const fetchChatData = async () => {
    if (!user_id) {
      setError('Please log in to view chat messages');
      setLoading(false);
      return;
    }

    try {
      setError('');
      const response = await API.get(`/api/chat/${user_id}`);
      // Handle standardized API response
      const responseData = response.data;
      const allMessages = responseData.messages || responseData || [];
      setMessages(allMessages);
      
      // Group messages into sessions by phone number
      const sessions = groupMessagesIntoSessions(allMessages);
      setChatSessions(sessions);
      
      // Select the first session by default if available and not in new chat mode
      if (sessions.length > 0 && !selectedChat && !isNewChat) {
        setSelectedChat(sessions[0]);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.detail ||
                          err.message ||
                          'Failed to load chat messages';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const groupMessagesIntoSessions = (messages) => {
    if (messages.length === 0) return [];

    // Group by phone number if available, otherwise by date
    const sessionMap = new Map();

    messages.forEach((msg) => {
      const key = msg.phone_number || new Date(msg.created_at).toDateString();
      
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          id: key,
          phoneNumber: msg.phone_number || null,
          title: msg.phone_number || getSessionTitle(msg.message),
          lastMessage: msg.message,
          timestamp: msg.created_at,
          messages: [msg]
        });
      } else {
        const session = sessionMap.get(key);
        session.messages.push(msg);
        session.lastMessage = msg.message;
        session.timestamp = msg.created_at;
      }
    });

    // Convert to array and sort by timestamp (most recent first)
    return Array.from(sessionMap.values()).sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
  };

  const getSessionTitle = (message) => {
    if (message.length > 30) {
      return message.substring(0, 30) + '...';
    }
    return message;
  };

  const formatSessionTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const handleSelectChat = (session) => {
    setSelectedChat(session);
    setIsNewChat(false);
    setNewChatNumber('');
    setNumberError('');
  };

  const handleNewChat = () => {
    setSelectedChat(null);
    setIsNewChat(true);
    setNewChatNumber('');
    setNumberError('');
    setMessages([]);
  };

  const handleStartChat = () => {
    if (!newChatNumber.trim()) {
      setNumberError('Please enter a phone number');
      return;
    }

    // Basic phone validation
    const cleanNumber = newChatNumber.replace(/\D/g, '');
    if (cleanNumber.length < 10) {
      setNumberError('Please enter a valid phone number');
      return;
    }

    // Check if chat with this number already exists
    const existingChat = chatSessions.find(s => s.phoneNumber === newChatNumber.trim());
    if (existingChat) {
      setSelectedChat(existingChat);
      setIsNewChat(false);
      setNewChatNumber('');
      return;
    }

    // Create new chat session
    setSelectedChat({
      id: newChatNumber.trim(),
      phoneNumber: newChatNumber.trim(),
      title: newChatNumber.trim(),
      lastMessage: '',
      timestamp: new Date().toISOString(),
      messages: []
    });
    setIsNewChat(false);
    setNumberError('');
  };

  const handleSend = async (e) => {
    e.preventDefault();

    if (!user_id || !inputMessage.trim() || sending) return;

    const userMessageText = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    const tempUserMessage = {
      id: Date.now(),
      user_id: parseInt(user_id),
      message: userMessageText,
      sender: 'user',
      phone_number: selectedChat?.phoneNumber || null,
      created_at: new Date().toISOString()
    };

    // Add to current messages
    if (selectedChat) {
      setSelectedChat(prev => ({
        ...prev,
        messages: [...prev.messages, tempUserMessage],
        lastMessage: userMessageText
      }));
    }

    try {
      setSendError('');
      const response = await API.post('/api/chat', {
        user_id: parseInt(user_id),
        message: userMessageText,
        phone_number: selectedChat?.phoneNumber || null
      });

      if (response.data) {
        if (selectedChat) {
          setSelectedChat(prev => ({
            ...prev,
            messages: [...prev.messages, response.data],
            lastMessage: response.data.message
          }));
        }
        // Refresh chat sessions
        await fetchChatData();
      }
    } catch (err) {
      // Remove the optimistic message on error
      if (selectedChat) {
        setSelectedChat(prev => ({
          ...prev,
          messages: prev.messages.filter(msg => msg.id !== tempUserMessage.id)
        }));
      }
      setInputMessage(userMessageText);
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.detail ||
                          err.message ||
                          'Failed to send message';
      setSendError(errorMessage);
      setTimeout(() => setSendError(''), 5000);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) 
        ? 'Just now' 
        : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Just now';
    }
  };

  const filteredSessions = chatSessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentMessages = selectedChat ? selectedChat.messages : [];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-800">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading chat...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-800">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Unable to Load Chat
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error}
          </p>
          <button
            onClick={() => {
              setError('');
              setLoading(true);
              fetchChatData();
            }}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-50 dark:bg-slate-800">
      {/* Recent Chats Sidebar */}
      <div className="w-80 bg-white dark:bg-slate-700 border-r border-gray-200 dark:border-slate-600 flex flex-col h-full">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-600">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Chats</h2>
            <button
              onClick={handleNewChat}
              className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center
                         hover:bg-indigo-700 transition-colors"
              title="New Chat"
            >
              <PlusIcon />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
              <SearchIcon />
            </div>
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-slate-600 border-0 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-500
                         transition-all text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-slate-600 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-300">
                <ChatBubbleIcon />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {searchQuery ? 'No chats found' : 'No conversations yet'}
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                Start a new chat to get started
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-600">
              {filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectChat(session)}
                  className={`
                    w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors
                    ${selectedChat?.id === session.id && !isNewChat ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-2 border-indigo-600' : ''}
                  `}
                >
                  <div className="flex items-center space-x-3">
                    {session.phoneNumber && (
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                        <PhoneIcon />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className={`
                          text-sm font-medium truncate
                          ${selectedChat?.id === session.id && !isNewChat ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}
                        `}>
                          {session.title}
                        </h3>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">
                          {formatSessionTime(session.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {session.lastMessage || 'No messages yet'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col h-full">
        {/* New Chat - Enter Number */}
        {isNewChat ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-800">
            <div className="text-center max-w-md w-full px-6">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <MessageIcon />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">Start a New Chat</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Enter a phone number to start sending and receiving messages.
              </p>
              
              <div className="space-y-4">
                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                      <PhoneIcon />
                    </div>
                    <input
                      type="tel"
                      value={newChatNumber}
                      onChange={(e) => {
                        setNewChatNumber(e.target.value);
                        setNumberError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleStartChat();
                        }
                      }}
                      placeholder="+1 (555) 123-4567"
                      className={`
                        w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-600 border-2 rounded-xl text-lg text-center
                        focus:outline-none focus:border-indigo-500 transition-colors text-gray-900 dark:text-white placeholder-gray-400
                        ${numberError ? 'border-red-300 dark:border-red-500' : 'border-gray-200 dark:border-slate-500'}
                      `}
                    />
                  </div>
                  {numberError && (
                    <p className="mt-2 text-sm text-red-500 dark:text-red-400">{numberError}</p>
                  )}
                </div>

                <button
                  onClick={handleStartChat}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium 
                             rounded-xl transition-colors shadow-lg shadow-indigo-500/25"
                >
                  Start Chat
                </button>

                <button
                  onClick={() => {
                    setIsNewChat(false);
                    if (chatSessions.length > 0) {
                      setSelectedChat(chatSessions[0]);
                    }
                  }}
                  className="w-full py-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="px-6 py-4 bg-white dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-3">
                {selectedChat.phoneNumber && (
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <PhoneIcon />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                    {selectedChat.title}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedChat.phoneNumber ? 'SMS Chat' : 'AI Assistant'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                {/* Call Button - Only show for phone chats */}
                {selectedChat.phoneNumber && (
                  <button
                    onClick={handleCall}
                    disabled={calling}
                    className={`
                      flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all
                      ${calling 
                        ? 'bg-gray-100 dark:bg-slate-600 text-gray-400 cursor-not-allowed' 
                        : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25'
                      }
                    `}
                    title={`Call ${selectedChat.phoneNumber}`}
                  >
                    {calling ? (
                      <>
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        <span>Calling...</span>
                      </>
                    ) : (
                      <>
                        <CallIcon />
                        <span>Call</span>
                      </>
                    )}
                  </button>
                )}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5"></span>
                  Active
                </span>
              </div>
            </div>

            {/* Call Status Messages */}
            {(callSuccess || callError) && (
              <div className={`
                px-4 py-3 text-sm flex items-center justify-center
                ${callSuccess ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}
              `}>
                {callSuccess && (
                  <>
                    <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                    {callSuccess}
                  </>
                )}
                {callError && (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {callError}
                  </>
                )}
              </div>
            )}

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {currentMessages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">Start Messaging</h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      Send a message to {selectedChat.phoneNumber || 'start the conversation'}.
                    </p>
                  </div>
                </div>
              ) : (
                currentMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-start space-x-3 ${
                      message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                      ${message.sender === 'user' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-gray-300'
                      }
                    `}>
                      {message.sender === 'user' ? (
                        <UserIcon />
                      ) : (
                        <AIIcon />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div className={`
                      max-w-[70%] rounded-2xl px-4 py-3 shadow-sm
                      ${message.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-md'
                        : 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white rounded-tl-md border border-gray-100 dark:border-slate-500'
                      }
                    `}>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.message}
                      </p>
                      <p className={`
                        text-xs mt-1
                        ${message.sender === 'user' ? 'text-indigo-200' : 'text-gray-400 dark:text-gray-400'}
                      `}>
                        {formatTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div className="bg-white dark:bg-slate-700 border-t border-gray-200 dark:border-slate-600 flex-shrink-0">
              {/* Send Error */}
              {sendError && (
                <div className="px-4 pt-3 pb-1">
                  <div className="px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center">
                    <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {sendError}
                  </div>
                </div>
              )}
              <form onSubmit={handleSend} className="p-4 flex items-center space-x-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={`Message ${selectedChat.phoneNumber || ''}...`}
                    disabled={sending}
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-slate-600 border-0 rounded-xl text-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-500
                               transition-all disabled:opacity-50 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending || !inputMessage.trim()}
                  className={`
                    w-12 h-12 rounded-xl flex items-center justify-center
                    transition-all duration-200
                    ${sending || !inputMessage.trim()
                      ? 'bg-gray-200 dark:bg-slate-600 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-xl'
                    }
                  `}
                >
                  {sending ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                  <SendIcon />
                )}
              </button>
              </form>
            </div>
          </>
        ) : (
          // No chat selected
          <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-800">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <ChatBubbleIcon />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">Select a Chat</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Choose a conversation from the sidebar or start a new chat.
              </p>
              <button
                onClick={handleNewChat}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium 
                           rounded-xl transition-colors inline-flex items-center space-x-2"
              >
                <PlusIcon />
                <span>New Chat</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;
