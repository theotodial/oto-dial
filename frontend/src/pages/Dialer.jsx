import { useState, useEffect } from 'react';
import API from '../api';

function Dialer() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callLogs, setCallLogs] = useState([]);
  const [userNumbers, setUserNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle dialpad button clicks
  const handleDialpadClick = (digit) => {
    setPhoneNumber(prev => prev + digit);
    setError(''); // Clear any errors when typing
  };

  // Handle backspace
  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  // Handle clear
  const handleClear = () => {
    setPhoneNumber('');
    setError('');
  };

  const user_id = localStorage.getItem('user_id');

  // Fetch user's numbers and call logs
  const fetchData = async () => {
    if (!user_id) {
      setError('User not logged in');
      setLoading(false);
      return;
    }

    try {
      setError('');
      setSuccess('');
      // Fetch numbers and call logs in parallel
      const [numbersResponse, callsResponse] = await Promise.all([
        API.get(`/api/numbers/${user_id}`),
        API.get(`/api/calls/${user_id}`)
      ]);

      setUserNumbers(numbersResponse.data || []);
      setCallLogs(callsResponse.data || []);
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to load dialer data'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCall = async () => {
    if (!user_id) {
      setError('User not logged in');
      return;
    }

    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    // Get user's first number as from_number
    const fromNumber = userNumbers.length > 0 ? userNumbers[0].number : null;
    
    if (!fromNumber) {
      setError('You need to purchase a number first. Go to Dashboard to buy a number.');
      return;
    }

    setCalling(true);
    setError('');
    setSuccess('');

    try {
      await API.post('/api/calls', {
        user_id: parseInt(user_id),
        from_number: fromNumber,
        to_number: phoneNumber.trim()
      });

      setSuccess(`Call to ${phoneNumber.trim()} initiated successfully!`);
      // Clear input and refresh call logs
      setPhoneNumber('');
      await fetchData();
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to make call'
      );
    } finally {
      setCalling(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading dialer...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '2rem' }}>Dialer</h1>

      {calling && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1.5rem',
          backgroundColor: '#e7f3ff',
          color: '#004085',
          borderRadius: '4px',
          fontSize: '0.875rem',
          textAlign: 'center'
        }}>
          Processing call...
        </div>
      )}

      {success && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1.5rem',
          backgroundColor: '#d4edda',
          color: '#155724',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1.5rem',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {/* Call Input Section */}
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: '1px solid #dee2e6'
      }}>
        {/* Phone Number Display */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="phoneNumber" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Phone Number
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="tel"
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setError(''); // Clear errors when typing
              }}
              onKeyDown={(e) => {
                // Allow backspace, delete, arrow keys, etc.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (phoneNumber.trim() && !calling && userNumbers.length > 0) {
                    handleCall();
                  }
                } else if (e.key === 'Backspace') {
                  handleBackspace();
                  e.preventDefault();
                }
              }}
              placeholder="Enter Phone Number"
              disabled={calling || userNumbers.length === 0}
              style={{
                flex: 1,
                padding: '1rem',
                border: '2px solid #ced4da',
                borderRadius: '8px',
                fontSize: '1.5rem',
                fontWeight: '500',
                textAlign: 'center',
                letterSpacing: '0.1em',
                boxSizing: 'border-box',
                backgroundColor: calling || userNumbers.length === 0 ? '#e9ecef' : '#fff',
                cursor: calling || userNumbers.length === 0 ? 'not-allowed' : 'text'
              }}
            />
            {phoneNumber && (
              <button
                type="button"
                onClick={handleClear}
                disabled={calling}
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: calling ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                Clear
              </button>
            )}
          </div>
          {userNumbers.length > 0 && (
            <div style={{
              fontSize: '0.875rem',
              color: '#6c757d',
              marginTop: '0.5rem',
              textAlign: 'center'
            }}>
              Calling from: <strong>{userNumbers[0].number}</strong>
            </div>
          )}
          {userNumbers.length === 0 && (
            <div style={{
              fontSize: '0.875rem',
              color: '#dc3545',
              marginTop: '0.5rem',
              textAlign: 'center'
            }}>
              You need to purchase a number first. Go to Dashboard to buy a number.
            </div>
          )}
        </div>

        {/* Dialpad */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          maxWidth: '320px',
          margin: '0 auto 1.5rem auto'
        }}>
          {/* Dialpad buttons 1-9 */}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDialpadClick(num.toString())}
              disabled={calling || userNumbers.length === 0}
              style={{
                padding: '1.25rem',
                fontSize: '1.5rem',
                fontWeight: '600',
                backgroundColor: '#fff',
                border: '2px solid #dee2e6',
                borderRadius: '12px',
                cursor: calling || userNumbers.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                color: '#333',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseDown={(e) => {
                if (!calling && userNumbers.length > 0) {
                  e.target.style.transform = 'scale(0.95)';
                  e.target.style.backgroundColor = '#e9ecef';
                }
              }}
              onMouseUp={(e) => {
                if (!calling && userNumbers.length > 0) {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.backgroundColor = '#fff';
                }
              }}
              onMouseLeave={(e) => {
                if (!calling && userNumbers.length > 0) {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.backgroundColor = '#fff';
                }
              }}
            >
              {num}
            </button>
          ))}
          
          {/* Asterisk */}
          <button
            type="button"
            onClick={() => handleDialpadClick('*')}
            disabled={calling || userNumbers.length === 0}
            style={{
              padding: '1.25rem',
              fontSize: '1.5rem',
              fontWeight: '600',
              backgroundColor: '#fff',
              border: '2px solid #dee2e6',
              borderRadius: '12px',
              cursor: calling || userNumbers.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              color: '#333',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseDown={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(0.95)';
                e.target.style.backgroundColor = '#e9ecef';
              }
            }}
            onMouseUp={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(1)';
                e.target.style.backgroundColor = '#fff';
              }
            }}
            onMouseLeave={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(1)';
                e.target.style.backgroundColor = '#fff';
              }
            }}
          >
            *
          </button>

          {/* Zero */}
          <button
            type="button"
            onClick={() => handleDialpadClick('0')}
            disabled={calling || userNumbers.length === 0}
            style={{
              padding: '1.25rem',
              fontSize: '1.5rem',
              fontWeight: '600',
              backgroundColor: '#fff',
              border: '2px solid #dee2e6',
              borderRadius: '12px',
              cursor: calling || userNumbers.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              color: '#333',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseDown={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(0.95)';
                e.target.style.backgroundColor = '#e9ecef';
              }
            }}
            onMouseUp={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(1)';
                e.target.style.backgroundColor = '#fff';
              }
            }}
            onMouseLeave={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(1)';
                e.target.style.backgroundColor = '#fff';
              }
            }}
          >
            0
          </button>

          {/* Hash/Pound */}
          <button
            type="button"
            onClick={() => handleDialpadClick('#')}
            disabled={calling || userNumbers.length === 0}
            style={{
              padding: '1.25rem',
              fontSize: '1.5rem',
              fontWeight: '600',
              backgroundColor: '#fff',
              border: '2px solid #dee2e6',
              borderRadius: '12px',
              cursor: calling || userNumbers.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              color: '#333',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseDown={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(0.95)';
                e.target.style.backgroundColor = '#e9ecef';
              }
            }}
            onMouseUp={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(1)';
                e.target.style.backgroundColor = '#fff';
              }
            }}
            onMouseLeave={(e) => {
              if (!calling && userNumbers.length > 0) {
                e.target.style.transform = 'scale(1)';
                e.target.style.backgroundColor = '#fff';
              }
            }}
          >
            #
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          maxWidth: '320px',
          margin: '0 auto'
        }}>
          {/* Backspace Button */}
          <button
            type="button"
            onClick={handleBackspace}
            disabled={calling || !phoneNumber || userNumbers.length === 0}
            style={{
              padding: '1rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '500',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: calling || !phoneNumber || userNumbers.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              opacity: calling || !phoneNumber || userNumbers.length === 0 ? 0.6 : 1
            }}
          >
            ⌫ Delete
          </button>

          {/* Call Button */}
          <button
            type="button"
            onClick={handleCall}
            disabled={calling || !phoneNumber.trim() || userNumbers.length === 0}
            style={{
              flex: 1,
              padding: '1rem 2rem',
              fontSize: '1.25rem',
              fontWeight: '600',
              backgroundColor: calling || !phoneNumber.trim() || userNumbers.length === 0 ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '50px',
              cursor: calling || !phoneNumber.trim() || userNumbers.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: calling || !phoneNumber.trim() || userNumbers.length === 0 ? 'none' : '0 4px 12px rgba(40, 167, 69, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!calling && phoneNumber.trim() && userNumbers.length > 0) {
                e.target.style.backgroundColor = '#218838';
                e.target.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!calling && phoneNumber.trim() && userNumbers.length > 0) {
                e.target.style.backgroundColor = '#28a745';
                e.target.style.transform = 'scale(1)';
              }
            }}
          >
            {calling ? '⏳ Calling...' : '📞 Call'}
          </button>
        </div>
      </div>

      {/* Call Logs Section */}
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Call History</h2>

        {callLogs.length === 0 ? (
          <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
            No call logs yet. Make your first call to see history here.
          </p>
        ) : (
          <div style={{
            display: 'grid',
            gap: '1rem'
          }}>
            {callLogs.map((call) => (
              <div
                key={call.id}
                style={{
                  backgroundColor: 'white',
                  padding: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #dee2e6'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '0.5rem'
                }}>
                  <div>
                    <div style={{
                      fontSize: '1rem',
                      fontWeight: '500',
                      marginBottom: '0.25rem'
                    }}>
                      To: {call.to_number}
                    </div>
                    <div style={{
                      fontSize: '0.875rem',
                      color: '#6c757d'
                    }}>
                      From: {call.from_number}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#6c757d'
                  }}>
                    {new Date(call.created_at).toLocaleString()}
                  </div>
                </div>
                {call.transcript && (
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#495057',
                    marginTop: '0.5rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #dee2e6'
                  }}>
                    <strong>Transcript:</strong> {call.transcript}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dialer;
