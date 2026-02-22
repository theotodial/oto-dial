import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setAffiliateToken } from '../utils/affiliateAuth';

function AffiliateOAuthSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      navigate('/affiliate/login', { replace: true });
      return;
    }

    setAffiliateToken(token);
    navigate('/affiliate/dashboard', { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-700 dark:text-gray-300 font-medium">
          Signing you in to affiliate panel...
        </p>
      </div>
    </div>
  );
}

export default AffiliateOAuthSuccess;
