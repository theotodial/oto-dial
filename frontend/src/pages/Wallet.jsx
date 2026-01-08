import { useState, useEffect, useRef } from 'react';
import { getWallet, getTransactions, topup } from '../services/walletService';

function Wallet() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const isMountedRef = useRef(true);

  const fetchWalletData = async () => {
    if (!isMountedRef.current) return;
    
    try {
      // Fetch wallet balance
      const walletData = await getWallet();
      
      if (!isMountedRef.current) return;
      setBalance(walletData?.balance || 0);

      // Fetch transactions
      const transactionsData = await getTransactions();
      
      if (!isMountedRef.current) return;
      setTransactions(Array.isArray(transactionsData) ? transactionsData : []);

      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Failed to fetch wallet data:', err);
      setError('Failed to load wallet data');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchWalletData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchWalletData();
  };

  const showToast = (message, type = 'success') => {
    if (!isMountedRef.current) return;
    setToast({ message, type });
    setTimeout(() => {
      if (isMountedRef.current) {
        setToast(null);
      }
    }, 3000);
  };

  const handleTopUp = async (e) => {
    e.preventDefault();
    
    if (!isMountedRef.current) return;
    
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    setTopUpLoading(true);
    try {
      await topup(amount);
      
      if (!isMountedRef.current) return;
      
      showToast(`Successfully topped up $${amount.toFixed(2)}`, 'success');
      setTopUpAmount('');
      // Refresh balance automatically
      await fetchWalletData();
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast(err.message || 'Failed to top up wallet', 'error');
    } finally {
      if (isMountedRef.current) {
        setTopUpLoading(false);
      }
    }
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
        <div>Loading wallet...</div>
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
        <button
          onClick={handleRefresh}
          style={{
            padding: '0.5rem 1rem',
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
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <h2 style={{ margin: 0 }}>Wallet</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '0.5rem 1.5rem',
            backgroundColor: refreshing ? '#999' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {refreshing ? (
            <>
              <span>Refreshing...</span>
            </>
          ) : (
            <>
              <span>🔄</span>
              <span>Refresh</span>
            </>
          )}
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '1rem 1.5rem',
            backgroundColor: toast.type === 'success' ? '#d4edda' : '#f8d7da',
            border: `1px solid ${toast.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
            borderRadius: '8px',
            color: toast.type === 'success' ? '#155724' : '#721c24',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            maxWidth: '400px',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          <div style={{ fontWeight: '500' }}>
            {toast.type === 'success' ? '✓' : '✕'} {toast.message}
          </div>
          <style>{`
            @keyframes slideIn {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}

      {/* Balance Card */}
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '2rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: '1px solid #dee2e6'
      }}>
        <div style={{
          fontSize: '0.9rem',
          color: '#666',
          marginBottom: '0.5rem'
        }}>
          Current Balance
        </div>
        <div style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          color: '#28a745'
        }}>
          ${typeof balance === 'number' ? balance.toFixed(2) : '0.00'}
        </div>
      </div>

      {/* Top-up Section */}
      <div style={{
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: '1px solid #dee2e6',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Top-up Wallet</h3>
        <form onSubmit={handleTopUp} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              color: '#555',
              fontSize: '0.9rem'
            }}>
              Amount ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="Enter amount"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
              disabled={topUpLoading}
            />
          </div>
          <button
            type="submit"
            disabled={topUpLoading || !topUpAmount}
            style={{
              padding: '0.75rem 2rem',
              backgroundColor: topUpLoading || !topUpAmount ? '#999' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: topUpLoading || !topUpAmount ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background-color 0.2s'
            }}
          >
            {topUpLoading ? 'Processing...' : 'Top-up'}
          </button>
        </form>
      </div>

      {/* Transaction History */}
      <div>
        <h3 style={{ marginBottom: '1rem' }}>Transaction History</h3>
        
        {(transactions || []).length === 0 ? (
          <div style={{
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
            color: '#666'
          }}>
            <p>No transactions yet.</p>
          </div>
        ) : (
          <div style={{
            overflowX: 'auto',
            border: '1px solid #dee2e6',
            borderRadius: '8px'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: 'white'
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
                    Date
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#333'
                  }}>
                    Type
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#333'
                  }}>
                    Description
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#333'
                  }}>
                    Amount
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#333'
                  }}>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {(transactions || []).map((transaction, index) => (
                  <tr
                    key={transaction.id || index}
                    style={{
                      borderBottom: '1px solid #dee2e6'
                    }}
                  >
                    <td style={{ padding: '1rem', color: '#333' }}>
                      {transaction.date 
                        ? new Date(transaction.date).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td style={{ padding: '1rem', color: '#333' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        backgroundColor: transaction.type === 'credit' ? '#d4edda' : '#f8d7da',
                        color: transaction.type === 'credit' ? '#155724' : '#721c24'
                      }}>
                        {transaction.type || 'N/A'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: '#333' }}>
                      {transaction.description || 'N/A'}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'right',
                      color: transaction.type === 'credit' ? '#28a745' : '#dc3545',
                      fontWeight: '500'
                    }}>
                      {transaction.type === 'credit' ? '+' : '-'}${Math.abs(transaction.amount || 0).toFixed(2)}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'right',
                      color: '#333',
                      fontWeight: '500'
                    }}>
                      ${(transaction.balance || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Wallet;

