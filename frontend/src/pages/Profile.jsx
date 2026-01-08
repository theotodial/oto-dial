import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../api';

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

function Profile() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  
  const [profileData, setProfileData] = useState({
    fullName: '',
    email: '',
    phone: '',
    company: '',
    businessType: '',
    country: '',
    timezone: '',
    language: 'en',
  });

  const [verificationData, setVerificationData] = useState({
    isVerified: false,
    verificationType: '',
    idDocument: null,
    businessDocument: null,
  });

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const isMountedRef = useRef(true);

  const businessTypes = [
    'Individual',
    'Sole Proprietor',
    'LLC',
    'Corporation',
    'Partnership',
    'Non-Profit',
    'Other'
  ];

  useEffect(() => {
    isMountedRef.current = true;
    loadUserProfile();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadUserProfile = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);
      setError('');
      
      // Fetch user profile from API
      const response = await API.get('/api/users/profile');
      
      if (!isMountedRef.current) return;
      
      if (response.error) {
        console.warn('Profile load error:', response.error);
        // Try to use AuthContext user data as fallback
        if (authUser) {
          setProfileData(prev => ({
            ...prev,
            email: authUser.email || '',
            fullName: authUser.name || '',
            phone: authUser.phone || '',
          }));
        }
        setError(response.error);
        return;
      }

      const userData = response.data?.user || response.data;
      if (userData) {
        setUser(userData);
        const fullName = userData.name || 
          (userData.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : '');
        setProfileData(prev => ({
          ...prev,
          email: userData.email || prev.email || '',
          fullName: fullName || prev.fullName || '',
          phone: userData.phone || prev.phone || '',
          company: userData.company || prev.company || '',
        }));
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Profile load error:', err);
      setError('Failed to load profile');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfileData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!isMountedRef.current) return;
    
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Update user profile via API
      const response = await API.patch('/api/users/profile', {
        firstName: (profileData?.fullName || '').split(' ')[0] || profileData?.fullName || '',
        lastName: (profileData?.fullName || '').split(' ').slice(1).join(' ') || '',
        name: profileData?.fullName || '',
        phone: profileData.phone,
        company: profileData.company,
      });

      if (!isMountedRef.current) return;

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.data?.success || response.data?.user) {
        setSuccess('Profile updated successfully!');
        setTimeout(() => {
          if (isMountedRef.current) {
            setSuccess('');
          }
        }, 3000);
        // Reload profile to get updated data
        await loadUserProfile();
      } else {
        throw new Error(response.data?.error || 'Failed to update profile');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.message ||
                          err.message || 
                          'Failed to update profile';
      setError(errorMessage);
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleFileUpload = async (type, file) => {
    if (!file || !isMountedRef.current) return;
    
    const formData = new FormData();
    formData.append('document', file);
    formData.append('type', type);
    
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await API.post('/api/users/verify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (!isMountedRef.current) return;
      
      if (response.error) {
        setError(response.error);
      } else {
        setSuccess(`${type} verification initiated. Our team will review your documents within 24-48 hours.`);
        setTimeout(() => {
          if (isMountedRef.current) {
            setSuccess('');
          }
        }, 5000);
        await loadUserProfile();
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError('Failed to upload document');
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (!isMountedRef.current) return;
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    
    if (passwordData.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setPasswordSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await API.post('/api/users/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      
      if (!isMountedRef.current) return;
      
      if (response.error) {
        setError(response.error);
      } else {
        setSuccess('Password changed successfully!');
        setShowPasswordModal(false);
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => {
          if (isMountedRef.current) {
            setSuccess('');
          }
        }, 3000);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      if (isMountedRef.current) {
        setPasswordSaving(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-300">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-5xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Profile Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Manage your account details and verification status
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/50 text-red-700 dark:text-red-400 rounded-xl text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 px-4 py-3 bg-green-100 dark:bg-green-500/20 border border-green-300 dark:border-green-500/50 text-green-700 dark:text-green-400 rounded-xl text-sm flex items-center">
            <CheckIcon />
            <span className="ml-2">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Personal Information
              </h2>
              
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={profileData.fullName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profileData.email}
                    disabled
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
                    Email cannot be changed. Contact support if needed.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={profileData.phone}
                    onChange={handleInputChange}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    name="company"
                    value={profileData.company}
                    onChange={handleInputChange}
                    placeholder="Your Company Inc."
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Business Type
                  </label>
                  <select
                    name="businessType"
                    value={profileData.businessType}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="">Select business type</option>
                    {businessTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    name="country"
                    value={profileData.country}
                    onChange={handleInputChange}
                    placeholder="United States"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className={`w-full py-3 rounded-xl font-semibold transition-all ${
                    saving
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg hover:shadow-xl'
                  }`}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>

            {/* Identity Verification */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Identity Verification
              </h2>
              
              <div className="space-y-4">
                {/* Verification Status */}
                <div className={`p-4 rounded-xl border-2 ${
                  verificationData.isVerified 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-500' 
                    : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
                }`}>
                  <div className="flex items-center">
                    {verificationData.isVerified ? (
                      <>
                        <CheckIcon className="text-green-600 dark:text-green-400 mr-2" />
                        <span className="font-semibold text-green-700 dark:text-green-400">
                          Verified Account
                        </span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-semibold text-yellow-700 dark:text-yellow-400">
                          Verification Pending
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">
                    {verificationData.isVerified 
                      ? 'Your identity has been verified successfully.' 
                      : 'Upload your documents to verify your identity and unlock all features.'}
                  </p>
                </div>

                {/* Document Upload */}
                {!verificationData.isVerified && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Government ID (Driver's License, Passport, etc.)
                      </label>
                      <label className="block">
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) handleFileUpload('ID', file);
                          }}
                          className="hidden"
                        />
                        <div className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors flex flex-col items-center justify-center text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer">
                          <UploadIcon />
                          <span className="mt-2 text-sm font-medium">Click to upload ID document</span>
                        </div>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Business Verification (Optional - For higher limits)
                      </label>
                      <label className="block">
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) handleFileUpload('Business', file);
                          }}
                          className="hidden"
                        />
                        <div className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors flex flex-col items-center justify-center text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer">
                          <UploadIcon />
                          <span className="mt-2 text-sm font-medium">Click to upload business documents</span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Account Status */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
              <h3 className="text-lg font-semibold mb-4">Account Status</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-indigo-100">Member Since</span>
                  <span className="font-semibold">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-indigo-100">Account Type</span>
                  <span className="font-semibold">Standard</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-indigo-100">Verification</span>
                  <span className={`font-semibold ${verificationData.isVerified ? 'text-green-200' : 'text-yellow-200'}`}>
                    {verificationData.isVerified ? 'Verified' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <button 
                  onClick={() => setShowPasswordModal(true)}
                  className="w-full py-2 px-4 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Change Password
                </button>
                <button className="w-full py-2 px-4 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                  Delete Account
                </button>
              </div>
            </div>

            {/* Support */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Need Help?
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
                Our support team is here to assist you with verification and account issues.
              </p>
              <a
                href="/contact"
                className="block w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-center font-medium rounded-lg transition-colors"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;

