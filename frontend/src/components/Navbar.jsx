import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    // Check if user is logged in
    const userId = localStorage.getItem('user_id');
    setIsLoggedIn(!!userId);
  }, [location]); // Re-check when route changes

  const handleLogout = () => {
    // Clear localStorage
    localStorage.removeItem('user_id');
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('access_token');
    
    // Update state
    setIsLoggedIn(false);
    
    // Redirect to login
    navigate('/login');
  };

  const getLinkStyle = (path) => {
    const isActive = location.pathname === path;
    return {
      textDecoration: 'none',
      color: isActive ? '#007bff' : '#495057',
      fontWeight: isActive ? '600' : '500',
      borderBottom: isActive ? '2px solid #007bff' : '2px solid transparent',
      paddingBottom: '4px',
      transition: 'all 0.2s',
    };
  };

  return (
    <nav style={{
      backgroundColor: '#f8f9fa',
      borderBottom: '1px solid #dee2e6',
      padding: '1rem 2rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <Link
        to="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          const img = e.currentTarget.querySelector('img');
          if (img) img.style.opacity = '0.8';
        }}
        onMouseLeave={(e) => {
          const img = e.currentTarget.querySelector('img');
          if (img) img.style.opacity = '1';
        }}
      >
        <img
          src="/logo.svg"
          alt="OTO-DIAL Logo"
          style={{
            height: '45px',
            width: '45px',
            objectFit: 'contain',
            transition: 'opacity 0.2s',
            display: 'block',
          }}
          onError={(e) => {
            console.error('Logo failed to load:', e.target.src);
            // Fallback: show text if image fails
            e.target.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.textContent = 'OD';
            fallback.style.cssText = 'font-size: 1.5rem; font-weight: bold; font-style: italic; color: #333; font-family: Roboto, sans-serif;';
            e.target.parentElement.appendChild(fallback);
          }}
        />
      </Link>
      <div style={{
        display: 'flex',
        gap: '2rem',
        alignItems: 'center',
      }}>
        {!isLoggedIn ? (
          <>
            <Link
              to="/login"
              style={getLinkStyle('/login')}
              onMouseEnter={(e) => {
                if (location.pathname !== '/login') {
                  e.target.style.color = '#007bff';
                }
              }}
              onMouseLeave={(e) => {
                if (location.pathname !== '/login') {
                  e.target.style.color = '#495057';
                }
              }}
            >
              Login
            </Link>
            <Link
              to="/signup"
              style={getLinkStyle('/signup')}
              onMouseEnter={(e) => {
                if (location.pathname !== '/signup') {
                  e.target.style.color = '#007bff';
                }
              }}
              onMouseLeave={(e) => {
                if (location.pathname !== '/signup') {
                  e.target.style.color = '#495057';
                }
              }}
            >
              Signup
            </Link>
          </>
        ) : (
          <>
            <Link
              to="/dashboard"
              style={getLinkStyle('/dashboard')}
              onMouseEnter={(e) => {
                if (location.pathname !== '/dashboard') {
                  e.target.style.color = '#007bff';
                }
              }}
              onMouseLeave={(e) => {
                if (location.pathname !== '/dashboard') {
                  e.target.style.color = '#495057';
                }
              }}
            >
              Dashboard
            </Link>
            <Link
              to="/dialer"
              style={getLinkStyle('/dialer')}
              onMouseEnter={(e) => {
                if (location.pathname !== '/dialer') {
                  e.target.style.color = '#007bff';
                }
              }}
              onMouseLeave={(e) => {
                if (location.pathname !== '/dialer') {
                  e.target.style.color = '#495057';
                }
              }}
            >
              Dialer
            </Link>
            <Link
              to="/chat"
              style={getLinkStyle('/chat')}
              onMouseEnter={(e) => {
                if (location.pathname !== '/chat') {
                  e.target.style.color = '#007bff';
                }
              }}
              onMouseLeave={(e) => {
                if (location.pathname !== '/chat') {
                  e.target.style.color = '#495057';
                }
              }}
            >
              Chat
            </Link>
            <button
              onClick={handleLogout}
              style={{
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#dc3545'}
            >
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
