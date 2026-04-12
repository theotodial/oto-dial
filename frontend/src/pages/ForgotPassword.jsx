import { useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const res = await API.post('/api/auth/forgot-password', {
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      setSuccess(true);
      setEmail('');
    } catch (err) {
      setError(err.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 bg-gray-50 dark:bg-slate-900">
      <div className="max-w-md mx-auto p-8 border border-gray-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 shadow-lg">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
          Forgot Password?
        </h2>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6 text-sm">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        {loading && (
          <div className="p-3 mb-4 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm text-center">
            Sending reset link...
          </div>
        )}

        {success && (
          <div className="p-3 mb-4 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm">
            Password reset email sent
          </div>
        )}

        {error && (
          <div className="p-3 mb-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg"
              placeholder="Enter your email"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full p-3 rounded-lg text-white ${
              loading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-indigo-600 hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
