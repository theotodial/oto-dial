import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStores } from '../services/storeService';

function Stores() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getStores();
        setStores(data);
      } catch (err) {
        setError(err.message || 'Failed to load stores');
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, []);

  const handleStoreClick = () => {
    navigate('/signup');
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
        <div>
          <div style={{ 
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #007bff',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }}></div>
          <p style={{ marginTop: '1rem', color: '#666' }}>Loading stores...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>
          <p style={{ color: '#dc3545', fontSize: '1.1rem', marginBottom: '1rem' }}>
            Error: {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>Stores</h2>
      
      {stores.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
          <p>No stores available.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1.5rem'
        }}>
          {stores.map((store) => (
            <div
              key={store.id || store.name}
              onClick={handleStoreClick}
              style={{
                padding: '1.5rem',
                backgroundColor: '#fff',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <h3 style={{ 
                marginBottom: '0.75rem',
                color: '#333',
                fontSize: '1.25rem'
              }}>
                {store.name || 'Unnamed Store'}
              </h3>
              
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ 
                  color: '#666',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  Country:
                </span>{' '}
                <span style={{ color: '#333' }}>
                  {store.country || 'N/A'}
                </span>
              </div>
              
              <div>
                <span style={{ 
                  color: '#666',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  Created:
                </span>{' '}
                <span style={{ color: '#333' }}>
                  {store.created_at 
                    ? new Date(store.created_at).toLocaleDateString() 
                    : 'N/A'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Stores;

