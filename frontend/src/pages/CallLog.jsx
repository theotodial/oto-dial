import { useState, useEffect, useMemo } from 'react';
import { getCalls } from '../services/callService';

function CallLog() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const data = await getCalls();
        setCalls(data);
        setError(null);
      } catch (err) {
        setError(err.message || 'Failed to load call logs');
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();
  }, []);

  // Filter calls by search term
  const filteredCalls = useMemo(() => {
    if (!searchTerm) return calls;
    const term = searchTerm.toLowerCase();
    return calls.filter(call => 
      (call.from && call.from.toLowerCase().includes(term)) ||
      (call.to && call.to.toLowerCase().includes(term))
    );
  }, [calls, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredCalls.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCalls = filteredCalls.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
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
        <div>Loading call logs...</div>
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
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <h2 style={{ margin: 0 }}>Call Log</h2>
        <div style={{ width: '300px' }}>
          <input
            type="text"
            placeholder="Search by number..."
            value={searchTerm}
            onChange={handleSearchChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {filteredCalls.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          color: '#666'
        }}>
          {searchTerm ? 'No calls found matching your search.' : 'No call logs yet.'}
        </div>
      ) : (
        <>
          <div style={{
            overflowX: 'auto',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            backgroundColor: 'white',
            marginBottom: '1rem'
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
                    From
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#333'
                  }}>
                    To
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#333'
                  }}>
                    Date & Time
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#333'
                  }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCalls.map((call, index) => (
                  <tr
                    key={call.id || index}
                    style={{
                      borderBottom: '1px solid #dee2e6'
                    }}
                  >
                    <td style={{
                      padding: '1rem',
                      color: '#333',
                      fontWeight: '500'
                    }}>
                      {call.from || 'N/A'}
                    </td>
                    <td style={{
                      padding: '1rem',
                      color: '#333',
                      fontWeight: '500'
                    }}>
                      {call.to || 'N/A'}
                    </td>
                    <td style={{
                      padding: '1rem',
                      color: '#666'
                    }}>
                      {call.ts || call.createdAt
                        ? new Date(call.ts || call.createdAt).toLocaleString()
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
                        {call.status || 'Completed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '1rem'
            }}>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: currentPage === 1 ? '#ddd' : '#007bff',
                  color: currentPage === 1 ? '#666' : 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Previous
              </button>

              <div style={{
                display: 'flex',
                gap: '0.25rem',
                alignItems: 'center'
              }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          backgroundColor: currentPage === page ? '#007bff' : 'white',
                          color: currentPage === page ? 'white' : '#333',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: currentPage === page ? '600' : 'normal'
                        }}
                      >
                        {page}
                      </button>
                    );
                  } else if (
                    page === currentPage - 2 ||
                    page === currentPage + 2
                  ) {
                    return (
                      <span key={page} style={{ padding: '0 0.25rem' }}>
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: currentPage === totalPages ? '#ddd' : '#007bff',
                  color: currentPage === totalPages ? '#666' : 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Next
              </button>
            </div>
          )}

          <div style={{
            textAlign: 'center',
            marginTop: '1rem',
            color: '#666',
            fontSize: '0.9rem'
          }}>
            Showing {startIndex + 1} to {Math.min(endIndex, filteredCalls.length)} of {filteredCalls.length} calls
          </div>
        </>
      )}
    </div>
  );
}

export default CallLog;

