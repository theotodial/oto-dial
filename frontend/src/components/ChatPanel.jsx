import { useState, useEffect, useRef } from 'react';
import API from '../api';
import { notifySubscriptionChanged } from '../utils/subscriptionSync';

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

function ChatPanel({ selectedChat }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (selectedChat?.messages) {
      setMessages(selectedChat.messages);
      setLoading(false);
    } else {
      fetchMessages();
    }
  }, [selectedChat]);

  const fetchMessages = async () => {
    try {
      const normalized = selectedChat?.phoneNumber
        ? String(selectedChat.phoneNumber).replace(/\D/g, '')
        : '';
      const response = selectedChat?.phoneNumber
        ? await API.get('/api/messages', {
            params: { thread: selectedChat.phoneNumber, limit: 20 }
          })
        : await API.get('/api/messages', { params: { limit: 20 } });
      if (response.error) {
        setMessages([]);
        return;
      }

      let nextMessages = response.data?.messages || response.data || [];
      if (normalized) {
        nextMessages = nextMessages.filter((msg) => {
          const candidate = msg.phone_number || msg.to || msg.from || '';
          return String(candidate).replace(/\D/g, '') === normalized;
        });
      }
      setMessages(nextMessages);
    } catch (err) {
      // Silent fail - will show empty state
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();

    if (!selectedChat?.phoneNumber || !inputMessage.trim() || sending) return;

    const userMessageText = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    // Optimistically add user message
    const tempUserMessage = {
      id: Date.now(),
      message: userMessageText,
      sender: 'user',
      phone_number: selectedChat.phoneNumber,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response = await API.post('/api/sms/send', {
        to: selectedChat.phoneNumber,
        text: userMessageText
      });

      if (!response.error) {
        notifySubscriptionChanged();
        await fetchMessages();
      }
    } catch (err) {
      // Remove the optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      setInputMessage(userMessageText);
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full">
      {/* Chat Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            {selectedChat?.title || 'Chat'}
          </h2>
          <p className="text-sm text-gray-500">AI Assistant</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5"></span>
            Online
          </span>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Start a Conversation</h3>
              <p className="text-gray-500">
                Send a message to begin chatting with your AI assistant.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
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
                  : 'bg-gray-200 text-gray-600'
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
                  : 'bg-white text-gray-800 rounded-tl-md border border-gray-100'
                }
              `}>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {message.message}
                </p>
                <p className={`
                  text-xs mt-1
                  ${message.sender === 'user' ? 'text-indigo-200' : 'text-gray-400'}
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
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSend} className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={sending}
              className="w-full px-4 py-3 bg-gray-100 border-0 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white
                         transition-all disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={sending || !inputMessage.trim()}
            className={`
              w-12 h-12 rounded-xl flex items-center justify-center
              transition-all duration-200
              ${sending || !inputMessage.trim()
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
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
    </div>
  );
}

export default ChatPanel;
