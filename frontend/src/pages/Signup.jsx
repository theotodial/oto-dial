import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// Country codes with flags (emoji)
const countries = [
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+7', name: 'Russia', flag: '🇷🇺' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
];

function Signup() {
  const navigate = useNavigate();
  const { signup, isAuthenticated } = useAuth();

  const [formData, setFormData] = useState({ 
    firstName: '', 
    lastName: '', 
    email: '', 
    phone: '',
    countryCode: '+1',
    password: '',
    confirmPassword: ''
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!agreedToTerms) {
        throw new Error('Please accept the Terms and Conditions');
      }

      if (formData.password !== formData.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (formData.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      if (!formData.email) {
        throw new Error('Email is required');
      }

      const result = await signup(formData.email, formData.password, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.countryCode + formData.phone,
        name: `${formData.firstName} ${formData.lastName}`.trim()
      });
      if (!result.success) throw new Error(result.error);

      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/google`;
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 bg-gray-50 dark:bg-slate-900">
      <div className="max-w-md mx-auto p-8 border border-gray-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 shadow-lg">
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">Sign Up</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button 
          onClick={handleGoogleSignup} 
          className="w-full mb-6 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors font-medium flex items-center justify-center gap-3"
        >
          <GoogleIcon />
          <span>Continue with Google</span>
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-slate-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400">
              Or continue with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              First Name *
            </label>
            <input
              name="firstName"
              type="text"
              value={formData.firstName}
              onChange={handleChange}
              required
              placeholder="John"
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Last Name *
            </label>
            <input
              name="lastName"
              type="text"
              value={formData.lastName}
              onChange={handleChange}
              required
              placeholder="Doe"
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email Address *
            </label>
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="john.doe@example.com"
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Phone Number with Country Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Phone Number
            </label>
            <div className="flex gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                  className="px-3 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-2 min-w-[100px]"
                >
                  <span className="text-lg">{countries.find(c => c.code === formData.countryCode)?.flag || '🇺🇸'}</span>
                  <span className="text-sm">{formData.countryCode}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showCountryDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowCountryDropdown(false)}
                    ></div>
                    <div className="absolute top-full mt-1 left-0 z-20 w-64 max-h-60 overflow-y-auto bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg shadow-lg">
                      {countries.map((country) => (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, countryCode: country.code });
                            setShowCountryDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-slate-600 flex items-center gap-3 text-gray-900 dark:text-white"
                        >
                          <span className="text-lg">{country.flag}</span>
                          <span className="flex-1">{country.name}</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">{country.code}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <input
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="1234567890"
                className="flex-1 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password *
            </label>
            <input
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              placeholder="At least 6 characters"
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Confirm Password *
            </label>
            <input
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="Re-enter password"
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Terms Checkbox */}
          <label className="flex items-center mb-4">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mr-2 w-4 h-4 text-indigo-600 border-gray-300 dark:border-slate-600 rounded focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Agree to <Link to="/terms" className="text-indigo-600 dark:text-indigo-400 hover:underline">Terms and Conditions</Link>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className={`w-full p-3 rounded-lg font-medium transition-all ${
              loading
                ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account? <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Login</Link>
        </div>
      </div>
    </div>
  );
}

export default Signup;
