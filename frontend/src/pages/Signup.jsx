import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Signup failed. Please try again.');
      }

      // Insert user into users table
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: authData.user.email,
          name: formData.name || null
        });

      if (insertError) {
        console.error('Error inserting user:', insertError);
        // Continue anyway - auth user was created
      }

      setSuccess('Account created successfully! Redirecting to dashboard...');
      // Redirect to dashboard after a brief delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      let errorMessage = 'Signup failed. Please try again.';
      errorMessage = err.message || errorMessage;
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 bg-gray-50 dark:bg-slate-900">
      <div className="max-w-md mx-auto p-8 border border-gray-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 shadow-lg">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-6">Sign Up</h2>
        
        {loading && (
          <div className="p-3 mb-4 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm text-center">
            Loading...
          </div>
        )}

        {success && (
          <div className="p-3 mb-4 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm">
            {success}
          </div>
        )}

        {error && (
          <div className="p-3 mb-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base
                         bg-white dark:bg-slate-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         transition-all"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base
                         bg-white dark:bg-slate-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         transition-all"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base
                         bg-white dark:bg-slate-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full p-3 rounded-lg text-base font-medium text-white transition-all
                       ${loading 
                         ? 'bg-gray-400 cursor-not-allowed' 
                         : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                       }`}
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Signup;
