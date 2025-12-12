import { useState, useEffect } from 'react';
import API from '../api';

function Dashboard() {
  const [balance, setBalance] = useState(null);
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const user_id = localStorage.getItem('user_id');

  // Fetch wallet balance and numbers
  const fetchData = async () => {
    if (!user_id) {
      setError('User not logged in');
      setLoading(false);
      return;
    }

    try {
      setError('');
      setSuccess('');
      // Fetch wallet and numbers in parallel
      const [walletResponse, numbersResponse] = await Promise.all([
        API.get(`/api/wallet/${user_id}`),
        API.get(`/api/numbers/${user_id}`)
      ]);

      setBalance(walletResponse.data.balance);
      setNumbers(numbersResponse.data || []);
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to load dashboard data'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTopUp = async () => {
    if (!user_id) {
      setError('User not logged in');
      return;
    }

    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      await API.post('/api/wallet/topup', {
        user_id: parseInt(user_id),
        amount: 10
      });

      setSuccess('Wallet topped up successfully!');
      // Refresh wallet and numbers after top-up
      await fetchData();
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to top up wallet'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleBuyNumber = async () => {
    if (!user_id) {
      setError('User not logged in');
      return;
    }

    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await API.post('/api/numbers/buy', {
        user_id: parseInt(user_id)
      });

      setSuccess(`Number ${response.data.number} purchased successfully!`);
      // Refresh wallet and numbers after purchase
      await fetchData();
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to buy number'
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '2rem' }}>Dashboard</h1>

      {actionLoading && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1.5rem',
          backgroundColor: '#e7f3ff',
          color: '#004085',
          borderRadius: '4px',
          fontSize: '0.875rem',
          textAlign: 'center'
        }}>
          Processing...
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

      {/* Wallet Section */}
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: '1px solid #dee2e6'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Wallet Balance</h2>
        <div style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#28a745',
          marginBottom: '1rem'
        }}>
          ${balance !== null ? balance.toFixed(2) : '0.00'}
        </div>
        <button
          onClick={handleTopUp}
          disabled={actionLoading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: actionLoading ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: actionLoading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          {actionLoading ? 'Processing...' : 'Top Up $10'}
        </button>
      </div>

      {/* Numbers Section */}
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '1.5rem',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ margin: 0 }}>My Numbers</h2>
          <button
            onClick={handleBuyNumber}
            disabled={actionLoading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: actionLoading ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: actionLoading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {actionLoading ? 'Processing...' : 'Buy Number'}
          </button>
        </div>

        {numbers.length === 0 ? (
          <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
            No numbers purchased yet. Click "Buy Number" to get started.
          </p>
        ) : (
          <div style={{
            display: 'grid',
            gap: '1rem'
          }}>
            {numbers.map((number) => (
              <div
                key={number.id}
                style={{
                  backgroundColor: 'white',
                  padding: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #dee2e6',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{
                    fontSize: '1.1rem',
                    fontWeight: '500',
                    marginBottom: '0.25rem'
                  }}>
                    {number.number}
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#6c757d'
                  }}>
                    {number.country} • {new Date(number.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
