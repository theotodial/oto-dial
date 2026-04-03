import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';
import ProfilePictureCrop from '../components/ProfilePictureCrop';

const BackChevronIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const CheckIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

function Profile() {
  const navigate = useNavigate();
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
    verificationStatus: 'not_submitted',
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
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [profilePicture, setProfilePicture] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
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
        setProfilePicture(userData.profilePicture || null);
        const fullName = userData.name || 
          (userData.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : '');
        const iv = userData.identityVerification;
        setProfileData(prev => ({
          ...prev,
          email: userData.email || prev.email || '',
          fullName: fullName || prev.fullName || '',
          phone: userData.phone || prev.phone || '',
          company: userData.company || prev.company || '',
          businessType: userData.businessType || prev.businessType || '',
          country: userData.country || prev.country || '',
          timezone: userData.timezone || prev.timezone || '',
          language: userData.language || prev.language || 'en',
        }));
        if (iv) {
          setVerificationData((vd) => ({
            ...vd,
            isVerified: iv.status === 'approved',
            verificationStatus: iv.status || 'not_submitted',
            verificationType: iv.verificationType || vd.verificationType,
          }));
        }
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
        businessType: profileData.businessType,
        country: profileData.country,
        timezone: profileData.timezone,
        language: profileData.language,
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

    setSaving(true);
    setError('');
    setSuccess('');

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      try {
        const base64 = e.target.result;
        const payload = {
          verificationType: type === 'ID' ? 'individual' : 'business'
        };
        if (type === 'ID') {
          payload.idDocument = base64;
        } else {
          payload.businessDocument = base64;
        }

        const response = await API.post('/api/users/upload-verification', payload);

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
        if (isMountedRef.current) {
          setError('Failed to upload document');
        }
      } finally {
        if (isMountedRef.current) {
          setSaving(false);
        }
      }
    };
    fileReader.onerror = () => {
      if (isMountedRef.current) {
        setError('Failed to read file');
        setSaving(false);
      }
    };
    fileReader.readAsDataURL(file);
  };

  const handleProfilePictureSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError('Image size must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setCropImage(e.target.result);
        setShowCropModal(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (blob) => {
    try {
      setUploadingPicture(true);
      setError('');
      
      // Compress image before uploading
      const compressImage = (file, maxWidth = 400, maxHeight = 400, quality = 0.8) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              // Calculate new dimensions
              if (width > height) {
                if (width > maxWidth) {
                  height = (height * maxWidth) / width;
                  width = maxWidth;
                }
              } else {
                if (height > maxHeight) {
                  width = (width * maxHeight) / height;
                  height = maxHeight;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              canvas.toBlob(resolve, 'image/jpeg', quality);
            };
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        });
      };
      
      // Compress the cropped image
      const compressedBlob = await compressImage(blob, 400, 400, 0.85);
      
      // Convert compressed blob to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result;
        
        const response = await API.post('/api/users/upload-profile-picture', {
          profilePicture: base64
        });
        
        if (!isMountedRef.current) return;
        
        if (response.error) {
          setError(response.error);
        } else {
          setProfilePicture(response.data?.url || base64);
          window.dispatchEvent(new CustomEvent('oto-profile-updated'));
          setSuccess('Profile picture updated successfully!');
          setShowCropModal(false);
          setCropImage(null);
          setTimeout(() => {
            if (isMountedRef.current) {
              setSuccess('');
            }
          }, 3000);
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.response?.data?.error || 'Failed to upload profile picture');
    } finally {
      if (isMountedRef.current) {
        setUploadingPicture(false);
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
      <div className="max-w-5xl mx-auto p-6 lg:p-8 pt-4 lg:pt-8">
        {/* Mobile: back + title in one row (replaces floating layout button) */}
        <div className="mb-6 lg:hidden flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-shrink-0 w-10 h-10 mt-0.5 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700"
            aria-label="Go back"
          >
            <BackChevronIcon />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
              Profile Settings
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Manage your account details and verification status
            </p>
          </div>
        </div>

        {/* Desktop header */}
        <div className="mb-8 hidden lg:block text-center">
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
            {/* Profile Picture */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Profile Picture
              </h2>
              <div className="flex items-center gap-6">
                <div className="relative">
                  {profilePicture ? (
                    <img 
                      src={profilePicture} 
                      alt="Profile" 
                      className="w-24 h-24 rounded-full object-cover border-4 border-indigo-500"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-indigo-500 flex items-center justify-center text-white text-2xl font-bold border-4 border-indigo-500">
                      {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePictureSelect}
                      className="hidden"
                      disabled={uploadingPicture}
                    />
                    <span className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors disabled:opacity-50">
                      {uploadingPicture ? 'Uploading...' : 'Upload Photo'}
                    </span>
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    JPG, PNG or GIF. Max size 5MB. Round crop will be applied.
                  </p>
                </div>
              </div>
            </div>

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

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Timezone
                  </label>
                  <input
                    type="text"
                    name="timezone"
                    value={profileData.timezone}
                    onChange={handleInputChange}
                    placeholder="America/New_York"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Language
                  </label>
                  <select
                    name="language"
                    value={profileData.language}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                  </select>
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
                    : verificationData.verificationStatus === 'rejected'
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                      : verificationData.verificationStatus === 'pending'
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500'
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
                    ) : verificationData.verificationStatus === 'rejected' ? (
                      <>
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          Verification rejected
                        </span>
                      </>
                    ) : verificationData.verificationStatus === 'pending' ? (
                      <>
                        <span className="font-semibold text-amber-800 dark:text-amber-200">
                          Under review
                        </span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-semibold text-yellow-700 dark:text-yellow-400">
                          Not verified yet
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">
                    {verificationData.isVerified
                      ? 'Your identity has been verified successfully.'
                      : verificationData.verificationStatus === 'rejected'
                        ? 'Please upload new documents or contact support if you need help.'
                        : verificationData.verificationStatus === 'pending'
                          ? 'We are reviewing your documents (typically 24–48 hours).'
                          : 'Upload your documents to verify your identity and unlock all features.'}
                  </p>
                </div>

                {/* Document Upload */}
                {!verificationData.isVerified && verificationData.verificationStatus !== 'pending' && (
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
                <button 
                  onClick={() => setShowDeleteAccountModal(true)}
                  className="w-full py-2 px-4 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
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
              <button
                onClick={() => window.location.href = '/support'}
                className="block w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-center font-medium rounded-lg transition-colors"
              >
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !passwordSaving && setShowPasswordModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Change Password</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Password</label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Password</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Confirm new password"
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
              )}
              {success && (
                <div className="text-sm text-green-600 dark:text-green-400">{success}</div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  disabled={passwordSaving}
                  className="flex-1 py-2 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={passwordSaving}
                  className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {passwordSaving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !deletingAccount && setShowDeleteAccountModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Delete Account</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This action cannot be undone. All your data, subscriptions, and phone numbers will be permanently deleted.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Enter your password to confirm</label>
                <input
                  type="password"
                  value={deleteAccountPassword}
                  onChange={(e) => setDeleteAccountPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-red-500"
                  placeholder="Enter your password"
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
              )}
              {success && (
                <div className="text-sm text-green-600 dark:text-green-400">{success}</div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteAccountModal(false);
                    setDeleteAccountPassword('');
                    setError('');
                  }}
                  disabled={deletingAccount}
                  className="flex-1 py-2 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount || !deleteAccountPassword}
                  className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {deletingAccount ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Picture Crop Modal */}
      {showCropModal && cropImage && (
        <ProfilePictureCrop
          image={cropImage}
          onCrop={handleCropComplete}
          onCancel={() => {
            setShowCropModal(false);
            setCropImage(null);
          }}
        />
      )}
    </div>
  );
}

export default Profile;

