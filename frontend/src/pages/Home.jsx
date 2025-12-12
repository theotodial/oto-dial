import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function Home() {
  const [apiStatus, setApiStatus] = useState('checking');
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkApi = async () => {
      try {
        const response = await fetch('http://localhost:5000/');
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'OK') {
            setApiStatus('ok');
          } else {
            setApiStatus('error');
            setError('Unexpected response from backend');
          }
        } else {
          setApiStatus('error');
          setError('Backend not reachable');
        }
      } catch (err) {
        setApiStatus('error');
        setError('Backend not reachable');
      }
    };

    checkApi();
  }, []);

  return (
    <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'white', minHeight: 'calc(100vh - 80px)' }}>
      <h1>OTO-DIAL</h1>
      <div style={{ marginTop: '2rem' }}>
        {apiStatus === 'checking' && <p>Checking API connection...</p>}
        {apiStatus === 'ok' && (
          <p style={{ color: 'green', fontSize: '1.2rem', fontWeight: 'bold' }}>
            API OK
          </p>
        )}
        {apiStatus === 'error' && (
          <p style={{ color: 'red' }}>
            API Error: {error || 'Backend not reachable'}
          </p>
        )}
      </div>
      <div style={{ marginTop: '3rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <Link
          to="/login"
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            display: 'inline-block',
          }}
        >
          Login
        </Link>
        <Link
          to="/signup"
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#28a745',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            display: 'inline-block',
          }}
        >
          Sign Up
        </Link>
      </div>
    </div>
  );
}

export default Home;

