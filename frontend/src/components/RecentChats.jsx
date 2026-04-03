import { useState, useEffect } from 'react';
import API from '../api';

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

function RecentChats({ onSelectChat, selectedChatId, onNewChat }) {
  const [chatSessions, setChatSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchChatSessions();
  }, []);

  const fetchChatSessions = async () => {
    try {
      const response = await API.get('/api/messages');
      if (response.error) {
        setChatSessions([]);
        return;
      }

      const messages = response.data?.messages || response.data || [];
      const sessions = groupMessagesIntoSessions(messages);
      setChatSessions(sessions);
    } catch (err) {
      // Silent fail - will show empty state
      setChatSessions([]);
    } finally {
      setLoading(false);
    }
  };

  // Group messages into sessions by phone number (fallback: date)
  const groupMessagesIntoSessions = (messages) => {
    if (!Array.isArray(messages) || messages.length === 0) return [];

    const sessionMap = new Map();

    messages.forEach((msg) => {
      const phoneNumber = msg.phone_number || msg.to || msg.from || null;
      const key = phoneNumber || new Date(msg.created_at).toDateString();
      const messageText = msg.message || msg.text || msg.body || '';

      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          id: key,
          phoneNumber,
          title: phoneNumber || getSessionTitle(messageText),
          lastMessage: messageText,
          timestamp: msg.created_at,
          messages: [msg]
        });
      } else {
        const session = sessionMap.get(key);
        session.messages.push(msg);
        session.lastMessage = messageText;
        session.timestamp = msg.created_at;
      }
    });

    return Array.from(sessionMap.values()).sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );
  };

  const getSessionTitle = (message) => {
    // Create a title from the first message (truncate if too long)
    if (message.length > 30) {
      return message.substring(0, 30) + '...';
    }
    return message;
  };

  const formatTime = (timestamp) => {
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

  const filteredSessions = chatSessions.filter(session =>
    (session.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (session.lastMessage || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Chats</h2>
          <button
            onClick={onNewChat}
            className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center
                       hover:bg-indigo-700 transition-colors"
            title="New Chat"
          >
            <PlusIcon />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
            <SearchIcon />
          </div>
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-0 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white
                       transition-all"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            Loading chats...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <ChatBubbleIcon />
            </div>
            <p className="text-gray-500 text-sm">
              {searchQuery ? 'No chats found' : 'No conversations yet'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Start a new chat to get started
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelectChat(session)}
                className={`
                  w-full p-4 text-left hover:bg-gray-50 transition-colors
                  ${selectedChatId === session.id ? 'bg-indigo-50 border-l-2 border-indigo-600' : ''}
                `}
              >
                <div className="flex items-start justify-between mb-1">
                  <h3 className={`
                    text-sm font-medium truncate flex-1
                    ${selectedChatId === session.id ? 'text-indigo-600' : 'text-gray-900'}
                  `}>
                    {session.title}
                  </h3>
                  <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                    {formatTime(session.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {session.lastMessage}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default RecentChats;
