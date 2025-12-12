import { useState } from 'react';
import { getAvailableNumbers, buyNumber } from '../services/numberService';
import { useNavigate } from 'react-router-dom';

function BuyNumber() {
  const navigate = useNavigate();
  const [country, setCountry] = useState('US');
  const [numberType, setNumberType] = useState('local');
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(null);

  const countries = [
    { value: 'US', label: 'United States' },
    { value: 'UK', label: 'United Kingdom' },
    { value: 'CA', label: 'Canada' },
    { value: 'AU', label: 'Australia' },
    { value: 'DE', label: 'Germany' },
  ];

  const numberTypes = [
    { value: 'local', label: 'Local' },
    { value: 'toll-free', label: 'Toll-Free' },
    { value: 'mobile', label: 'Mobile' },
    { value: 'vanity', label: 'Vanity' },
  ];

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNumbers([]);

    try {
      const data = await getAvailableNumbers(country);
      setNumbers(data);
    } catch (err) {
      setError(err.message || 'Failed to search numbers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async (number) => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      setError('Please login to buy a number');
      return;
    }

    setBuying(number.id);
    try {
      const result = await buyNumber({
        email: userEmail,
        country: country,
        number: number.number || number.id,
        type: numberType
      });

      alert(`Successfully purchased number: ${result.number || number.number}`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to buy number. Please try again.');
    } finally {
      setBuying(null);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>Buy Phone Number</h2>

      {/* Search Form */}
      <div style={{
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: '1px solid #dee2e6',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <form onSubmit={handleSearch}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                color: '#555',
                fontSize: '0.9rem'
              }}>
                Country
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                  backgroundColor: 'white'
                }}
              >
                {countries.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                color: '#555',
                fontSize: '0.9rem'
              }}>
                Number Type
              </label>
              <select
                value={numberType}
                onChange={(e) => setNumberType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                  backgroundColor: 'white'
                }}
              >
                {numberTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.75rem 2rem',
              backgroundColor: loading ? '#999' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {loading ? 'Searching...' : 'Search Available Numbers'}
          </button>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c33'
        }}>
          {error}
        </div>
      )}

      {/* Results */}
      {numbers.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '1rem' }}>
            Available Numbers ({numbers.length})
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem'
          }}>
            {numbers.map((num) => (
              <div
                key={num.id}
                style={{
                  padding: '1.5rem',
                  backgroundColor: 'white',
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
              >
                <div style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  color: '#333',
                  marginBottom: '0.5rem'
                }}>
                  {num.number}
                </div>
                <div style={{
                  fontSize: '0.9rem',
                  color: '#666',
                  marginBottom: '0.5rem'
                }}>
                  {num.type} • {num.country}
                </div>
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  color: '#28a745',
                  marginBottom: '1rem'
                }}>
                  ${num.price.toFixed(2)}/month
                </div>
                <button
                  onClick={() => handleBuy(num)}
                  disabled={buying === num.id}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: buying === num.id ? '#999' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    cursor: buying === num.id ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (buying !== num.id) {
                      e.currentTarget.style.backgroundColor = '#218838';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (buying !== num.id) {
                      e.currentTarget.style.backgroundColor = '#28a745';
                    }
                  }}
                >
                  {buying === num.id ? 'Processing...' : 'Buy Now'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {!loading && numbers.length === 0 && !error && (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          color: '#666'
        }}>
          <p>Search for available numbers to see results.</p>
        </div>
      )}
    </div>
  );
}

export default BuyNumber;

