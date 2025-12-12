import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function ProtectedRoute({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    const user_id = localStorage.getItem('user_id');
    
    if (!user_id) {
      navigate('/login');
    }
  }, [navigate]);

  const user_id = localStorage.getItem('user_id');
  
  if (!user_id) {
    return null; // Don't render children while redirecting
  }

  return children;
}

export default ProtectedRoute;

