import { useState, useEffect, useRef } from 'react';
import API from '../api';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const messagesEndRef = useRef(null);

  const user_id = localStorage.getItem('user_id');

  // Scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch chat history
  const fetchMessages = async () => {
    if (!user_id) {
      setError('User not logged in');
      setLoading(false);
      return;
    }

    try {
      setError('');
      setSuccess('');
      const response = await API.get(`/api/chat/${user_id}`);
      setMessages(response.data || []);
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to load chat messages'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();

    if (!user_id) {
      setError('User not logged in');
      return;
    }

    if (!inputMessage.trim()) {
      return;
    }

    const userMessageText = inputMessage.trim();
    setInputMessage('');
    setSending(true);
    setError('');
    setSuccess('');

    // Optimistically add user message
    const tempUserMessage = {
      id: Date.now(), // Temporary ID
      user_id: parseInt(user_id),
      message: userMessageText,
      sender: 'user',
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response = await API.post('/api/chat', {
        user_id: parseInt(user_id),
        message: userMessageText
      });

      // Add AI reply from response
      if (response.data) {
        setMessages(prev => [...prev, response.data]);
        setSuccess('Message sent successfully!');
        // Clear success message after 2 seconds
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch (err) {
      // Remove the optimistic user message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to send message'
      );
      // Restore input message on error
      setInputMessage(userMessageText);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading chat...</p>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: 'calc(100vh - 80px)',
      display: 'flex',
      flexDirection: 'column',
      margin: 0,
      padding: 0,
      backgroundColor: '#f8f9fa',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #dee2e6',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 10
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Chat</h1>
      </div>

      {/* Alert Messages */}
      {(sending || success || error) && (
        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: sending ? '#e7f3ff' : success ? '#d4edda' : '#f8d7da',
          color: sending ? '#004085' : success ? '#155724' : '#721c24',
          fontSize: '0.875rem',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {sending && 'Sending message...'}
          {success && success}
          {error && error}
        </div>
      )}

      {/* Messages Container */}
      <div style={{
        flex: 1,
        backgroundColor: '#f8f9fa',
        padding: '1rem',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        minHeight: 0
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#6c757d',
            fontStyle: 'italic',
            padding: '2rem'
          }}>
            No messages yet. Start a conversation!
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              style={{
                display: 'flex',
                justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start',
                width: '100%'
              }}
            >
              <div
                style={{
                  maxWidth: '70%',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  backgroundColor: message.sender === 'user' ? '#007bff' : '#ffffff',
                  color: message.sender === 'user' ? '#ffffff' : '#333333',
                  border: message.sender === 'ai' ? '1px solid #dee2e6' : 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  marginBottom: '0.25rem',
                  opacity: 0.8
                }}>
                  {message.sender === 'user' ? 'You' : 'AI'}
                </div>
                <div style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {message.message}
                </div>
                <div style={{
                  fontSize: '0.6875rem',
                  opacity: 0.8,
                  marginTop: '0.375rem',
                  fontWeight: '400'
                }}>
                  {(() => {
                    if (!message.created_at) return 'Just now';
                    try {
                      const date = new Date(message.created_at);
                      return isNaN(date.getTime()) 
                        ? 'Just now' 
                        : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch (e) {
                      return 'Just now';
                    }
                  })()}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div style={{
        padding: '1rem',
        backgroundColor: '#fff',
        borderTop: '1px solid #dee2e6',
        boxShadow: '0 -2px 4px rgba(0,0,0,0.1)'
      }}>
        <form onSubmit={handleSend} style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center'
        }}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            style={{
              flex: 1,
              padding: '0.875rem 1rem',
              border: '2px solid #dee2e6',
              borderRadius: '24px',
              fontSize: '1rem',
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#007bff'}
            onBlur={(e) => e.target.style.borderColor = '#dee2e6'}
          />
          <button
            type="submit"
            disabled={sending || !inputMessage.trim()}
            style={{
              padding: '0.875rem 1.5rem',
              backgroundColor: sending || !inputMessage.trim() ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '24px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: sending || !inputMessage.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              minWidth: '80px'
            }}
          >
            {sending ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Chat;
