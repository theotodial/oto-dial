import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyNumbers } from '../services/numberService';

function MyNumbers() {
  const navigate = useNavigate();
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    const fetchNumbers = async () => {
      if (!isMountedRef.current) return;
      
      try {
        const data = await getMyNumbers();
        
        if (!isMountedRef.current) return;
        
        if (Array.isArray(data)) {
          setNumbers(data);
          setError(null);
        } else {
          setError('Failed to load numbers');
          setNumbers([]);
        }
        setLoading(false);
      } catch (err) {
        if (!isMountedRef.current) return;
        setError('Failed to load numbers');
        setNumbers([]);
        setLoading(false);
      }
    };

    fetchNumbers();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleManage = (number) => {
    // Store the selected number for chat page
    localStorage.setItem('selectedNumber', number.number || number.id);
    navigate('/chat');
  };

  if (loading) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>Loading numbers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c33',
          marginBottom: '1rem'
        }}>
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>My Numbers</h2>

      {numbers.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          color: '#666'
        }}>
          <p>You don't have any numbers yet.</p>
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          backgroundColor: 'white'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}>
            <thead>
              <tr style={{
                backgroundColor: '#f8f9fa',
                borderBottom: '2px solid #dee2e6'
              }}>
                <th style={{
                  padding: '1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  Number
                </th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  Country
                </th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  Created At
                </th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  Status
                </th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((num, index) => (
                <tr
                  key={num.id || index}
                  style={{
                    borderBottom: '1px solid #dee2e6'
                  }}
                >
                  <td style={{
                    padding: '1rem',
                    color: '#333',
                    fontWeight: '500'
                  }}>
                    {num.number || 'N/A'}
                  </td>
                  <td style={{
                    padding: '1rem',
                    color: '#666'
                  }}>
                    {num.country || 'N/A'}
                  </td>
                  <td style={{
                    padding: '1rem',
                    color: '#666'
                  }}>
                    {num.created_at || num.purchasedAt
                      ? new Date(num.created_at || num.purchasedAt).toLocaleDateString()
                      : 'N/A'}
                  </td>
                  <td style={{
                    padding: '1rem',
                    color: '#666'
                  }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      backgroundColor: '#d4edda',
                      color: '#155724',
                      fontWeight: '500'
                    }}>
                      {num.status || 'Active'}
                    </span>
                  </td>
                  <td style={{
                    padding: '1rem',
                    textAlign: 'center'
                  }}>
                    <button
                      onClick={() => handleManage(num)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0056b3';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#007bff';
                      }}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default MyNumbers;

